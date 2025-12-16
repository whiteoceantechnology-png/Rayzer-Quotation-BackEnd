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

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV === 'development';

export default app => {
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignorePaths: ['/status', '/health', '/favicon.ico'],
        },
        redact: {
          paths: ['req.headers.authorization'],
        },
        genReqId(req) {
          return req.id || req.headers['x-request-id'] || randomUUID();
        },
        customLogLevel(res, err) {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(compression());
  app.use(
    express.json({
      limit: process.env.REQUEST_PAYLOAD_LIMIT || '1mb',
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: process.env.REQUEST_PAYLOAD_LIMIT || '1mb',
    }),
  );
  app.use(passport.initialize());
  app.use(helmet());
  app.use(cors());
  if (isDev && !isTest) {
    app.use(expressStatusMonitor());
  }
  app.use(methodOverride());
};
