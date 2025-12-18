/**
 * Server setup
 */
import express from 'express';

import './services/auth.js';
import sequelize from './config/database.js';
import middlewaresConfig from './config/middlewares.js';
import constants from './config/constants.js';
import ApiRoutes from './routes/index.js';
import { transformResponseMiddleware } from './utils/transformResponse.js';
import logger from './utils/logger.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

middlewaresConfig(app);
app.use(transformResponseMiddleware);
app.use('/api', ApiRoutes);

const server = app.listen(constants.PORT, async err => {
  if (err) {
    logger.error({ err }, 'Cannot start server');
    return;
  }

  try {
    await sequelize.sync();
    logger.info('MariaDB synced');
  } catch (dbErr) {
    logger.error({ err: dbErr }, 'MariaDB sync error');
  }

  logger.info(
    { port: constants.PORT, env: process.env.NODE_ENV },
    'Server is listening',
  );
});

process.on('unhandledRejection', err => {
  logger.error({ err }, 'Unhandled promise rejection');
});

process.on('uncaughtException', err => {
  logger.fatal({ err }, 'Uncaught exception');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

export { server };
export default app;
