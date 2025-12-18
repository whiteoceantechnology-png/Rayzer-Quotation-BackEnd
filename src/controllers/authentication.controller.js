/**
 * Authentication controller
 */

import HTTPStatus from 'http-status';
import Joi from 'joi';

import User from '../models/user.model.js';
import logger from '../utils/logger.js';

export const validation = {
  login: {
    body: {
      username: Joi.string()
        .required(),
      password: Joi.string()
        .regex(/^[a-zA-Z0-9]{3,30}$/)
        .required(),
    },
  },
};

/**
 * @api {post} /users/login Login a user
 * @apiDescription Login a user
 * @apiName loginUser
 * @apiGroup User
 *
 * @apiParam (Body) {String} email User email.
 * @apiParam (Body) {String} password User password.
 *
 * @apiSuccess {Number} status Status of the Request.
 * @apiSuccess {String} _id User _id.
 * @apiSuccess {String} token Authentication token.
 *
 * @apiSuccessExample Success-Response:
 *
 * HTTP/1.1 200 OK
 *
 * {
 *  _id: '123',
 *  token: 'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1OTBhMWI3ODAzMDI3N2NiNjQxM2JhZGUiLCJpYXQiOjE0OTM4MzQ2MTZ9.RSlMF6RRwAALZQRdfKrOZWnuHBk-mQNnRcCLJsc8zio',
 * }
 *
 * @apiErrorExample {json} Error
 *  HTTP/1.1 400 Bad Request
 *
 *  {
 *    email: 'email is required'
 *  }
 */
export async function login(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    requestLogger.info({ userId: req.user?.id }, 'User authenticated');

    const respObj = {
      message: 'Login successful',
      status: 1,
      data: req.user,
    }
    return res.status(HTTPStatus.OK).json(respObj);

  } catch (error) {
    (req.log || logger).error({ err: error }, 'Authentication login error');
    return next(error);
  }
}

export async function getProfile(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    requestLogger.debug({ userId: req.user?.id }, 'Fetching profile');
    const userProfile = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] } // Sequelize uses attributes: { exclude: ... }
    });
    const respObj = {
      message: 'Login successful',
      status: 1,
      data: userProfile,
    }
    return res.status(HTTPStatus.OK).json(respObj);

  } catch (error) {
    (req.log || logger).error({ err: error }, 'Fetch profile error');
    return next(error);
  }
}


