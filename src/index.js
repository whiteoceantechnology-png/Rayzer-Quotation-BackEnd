/**
 * Server setup - SaaS Ready
 * Features: Health checks, graceful shutdown, connection pooling, observability
 */
import express from 'express';
import os from 'os';

import './services/auth.js';
import sequelize from './config/database.js';
import middlewaresConfig from './config/middlewares.js';
import constants from './config/constants.js';
import ApiRoutes from './routes/index.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpecs from './config/swagger.js';
import logger from './utils/logger.js';

const app = express();
const startTime = Date.now();
let isShuttingDown = false;
let serverReady = false;

// Security
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('etag', 'strong');

// Apply middlewares
middlewaresConfig(app);

// Health check endpoints (before auth middleware)
app.get('/health', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  if (isShuttingDown || !serverReady) {
    return res.status(503).json({ status: 'not_ready' });
  }
  
  try {
    await sequelize.authenticate();
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', database: 'disconnected' });
  }
});

app.get('/health/live', (req, res) => {
  res.json({ 
    status: 'alive',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: process.memoryUsage(),
    pid: process.pid,
  });
});

// Metrics endpoint for monitoring
app.get('/metrics', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
    memory_heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
    memory_rss_mb: Math.round(memUsage.rss / 1024 / 1024),
    cpu_count: os.cpus().length,
    load_average: os.loadavg(),
    node_version: process.version,
    env: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api', ApiRoutes);

// API Documentation (disable in production if needed)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
    customSiteTitle: 'Rayzer API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 0, message: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  logger.error({ err, path: req.path, method: req.method }, 'Request error');
  
  res.status(statusCode).json({
    status: 0,
    message: process.env.NODE_ENV === 'production' && statusCode >= 500 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Database connection with retry
async function connectDatabase(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      logger.info('Database connection established');
      
      // Sync models (use migrations in production)
      if (process.env.NODE_ENV !== 'production') {
        await sequelize.sync({ alter: false });
        logger.info('Database models synced');
      }
      return true;
    } catch (err) {
      logger.warn({ err, attempt: i + 1, maxAttempts: retries }, 'Database connection failed, retrying...');
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info({ signal }, 'Graceful shutdown initiated');
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close database connections
      await sequelize.close();
      logger.info('Database connections closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Start server
const server = app.listen(constants.PORT, async () => {
  logger.info({ port: constants.PORT, env: process.env.NODE_ENV, pid: process.pid }, 'Server starting...');
  
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    logger.fatal('Failed to connect to database after retries');
    process.exit(1);
  }
  
  serverReady = true;
  logger.info({ port: constants.PORT, env: process.env.NODE_ENV }, 'Server ready to accept connections');
});

// Configure server timeouts
server.keepAliveTimeout = 65000; // Slightly higher than ALB/nginx timeout
server.headersTimeout = 66000;

// Signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, 'Unhandled promise rejection');
});

process.on('uncaughtException', err => {
  logger.fatal({ err }, 'Uncaught exception - initiating shutdown');
  gracefulShutdown('uncaughtException');
});

export { server, app };
export default app;
