/**
 * Error handler for api routes
 */

import HTTPStatus from 'http-status';

import APIError, { RequiredError } from './error.js';
import logger from '../utils/logger.js';

const isDev = process.env.NODE_ENV === 'development';

// eslint-disable-next-line no-unused-vars
export default function logErrorService(err, req, res, next) {
  if (!err) {
    return new APIError(
      'Error with the server!',
      HTTPStatus.INTERNAL_SERVER_ERROR,
      true,
    );
  }

  const requestLogger = (req && req.log) || logger;
  requestLogger.error({ err, path: req?.originalUrl }, 'Unhandled application error');

  const error = {
    message: err.isPublic ? err.message : 'Internal Server Error.',
  };

  if (err.errors) {
    error.errors = {};
    const { errors } = err;
    if (Array.isArray(errors)) {
      error.errors = RequiredError.makePretty(errors);
    } else {
      Object.keys(errors).forEach(key => {
        error.errors[key] = errors[key].message;
      });
    }
  }

  const statusCode = err.status || HTTPStatus.INTERNAL_SERVER_ERROR;

  if (isDev && err.stack) {
    error.stack = err.stack;
  }

  res.status(statusCode).json(error);

  return undefined;
}
