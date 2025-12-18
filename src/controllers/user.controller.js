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

export async function create(req, res, next) {
  try {
    const user = await User.create(req.body);
    return res.status(HTTPStatus.CREATED).json({ message: 'User created successfully', status: 1, data: user.toAuthJSON() });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const hashedPassword = await hash(req.body.password, 10);
    await User.update({ password: hashedPassword }, { where: { id: req.user.id } });
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

    // Sequelize update
    await User.update(req.body, { where: { id: req.user.id } });

    // Fetch updated
    const userProfile = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    const respObj = {
      message: 'updateProfile successful',
      status: 1,
      data: userProfile,
    }
    return res.status(HTTPStatus.OK).json(respObj);

  } catch (error) {
    (req.log || logger).error({ err: error }, 'Update profile error');
    return next(error);
  }
}