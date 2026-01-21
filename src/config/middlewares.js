/**
 * Configuration of the server middlewares.
 */

import express from 'express';
import compression from 'compression';
import passport from 'passport';
import methodOverride from 'method-override';
import helmet from 'helmet';
import cors from 'cors';
import expressStatusMonitor from 'express-status-monitor';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

import logger from '../utils/logger.js';
import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://dashboard.rayzerlights.com',
  'https://rayzerlights.com',
  'https://www.rayzerlights.com',
];

export default app => {
  // Trust proxy (important when behind Cloudflare/nginx)
  if (isProd) {
    app.set('trust proxy', 1);
  }

  // Request logging
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignorePaths: ['/status', '/health', '/favicon.ico', '/api/health'],
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
        genReqId(req) {
          return req.id || req.headers['x-request-id'] || req.headers['cf-ray'] || randomUUID();
        },
        customLogLevel(res, err) {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  // Compression
  app.use(compression({
    level: 6,
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));

  // Body parsing with size limits
  const jsonLimit = process.env.JSON_PAYLOAD_LIMIT || '1mb';
  const uploadLimit = process.env.UPLOAD_PAYLOAD_LIMIT || '50mb';
  
  app.use(
    express.json({
      limit: jsonLimit,
      strict: true,
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: jsonLimit,
      parameterLimit: 1000,
    }),
  );

  // Authentication
  app.use(passport.initialize());

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: isDev ? false : undefined,
    crossOriginEmbedderPolicy: false, // Allow loading external resources
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      if (isDev || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // In production, you might want to restrict this
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    maxAge: 86400, // Cache preflight for 24 hours
  }));

  // Status monitor (dev only)
  if (isDev && !isTest) {
    app.use(expressStatusMonitor());
  }

  // Rate Limiting - General API
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProd ? 500 : 1000, // Higher limit for dev
    message: { status: 0, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return ['/health', '/status', '/api/health'].includes(req.path);
    },
    validate: false, // Disable all validation
    keyGenerator: (req) => {
      // Use CF-Connecting-IP if behind Cloudflare, otherwise use IP
      return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    },
  });

  // Stricter rate limit for auth routes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit auth attempts
    message: { status: 0, message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => {
      return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    },
  });

  // Apply rate limiters
  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  // Method override for legacy clients
  app.use(methodOverride());

  // Request timeout (30 seconds)
  app.use((req, res, next) => {
    req.setTimeout(30000, () => {
      res.status(408).json({ status: 0, message: 'Request timeout' });
    });
    next();
  });
};
