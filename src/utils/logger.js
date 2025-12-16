import pino from 'pino';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = pino({
  level,
  base: {
    env: process.env.NODE_ENV,
    service: process.env.SERVICE_NAME || 'quotation-server',
  },
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'password', 'token'],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
