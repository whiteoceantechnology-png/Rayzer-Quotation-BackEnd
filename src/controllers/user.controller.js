/**
 * User controller
 */

import Joi from 'joi';
import HTTPStatus from 'http-status';

import User from '../models/user.model.js';
import { hash } from 'bcrypt';
import logger from '../utils/logger.js';

export const validation = {
  create: {
    body: {
      email: Joi.string()
        .email()
        .required(),
      password: Joi.string()
        .min(6)
        .regex(/^(?=.*[0-9])(?=.*[a-zA-Z])([a-zA-Z0-9]+)$/)
        .required(),
      username: Joi.string()
        .min(3)
        .max(20)
        .required(),
    },
  },
};

/**
 * @api {post} /users/signup Create a user
 * @apiDescription Create a user
 * @apiName createUser
 * @apiGroup User
 *
 * @apiParam (Body) {String} email User email.
 * @apiParam (Body) {String} password User password.
 * @apiParam (Body) {String} username User username.
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
export async function create(req, res, next) {
  // const body = filteredBody(req.body, constants.WHITELIST.users.create);
  try {
    const user = await User.create(req.body);
    return res.status(HTTPStatus.CREATED).json({ message: 'User created successfully', status: 1, data: user.toAuthJSON() });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function resetPassword(req, res, next) {
  // const body = filteredBody(req.body, constants.WHITELIST.users.create);
  try {
    const hashedPassword = await hash (req.body.password, 10);
    await User.findByIdAndUpdate(req.user.id, { password: hashedPassword });
    return res.status(HTTPStatus.OK).json({ message: 'Password reset successful', status: 1 });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Reset password error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    requestLogger.debug({ userId: req.user?.id }, 'Updating profile');
    delete req.body.password; // Prevent password updates here
    const userProfile = await User.findByIdAndUpdate({_id:req.user.id}, req.body, { new: true }).select('-password -_id');
    const respObj= {
      message: 'updateProfile successful',
      status:1,
      data: userProfile,
    }
    return res.status(HTTPStatus.OK).json(respObj);

  } catch (error) {
    (req.log || logger).error({ err: error }, 'Update profile error');
    return next(error);
  }
}