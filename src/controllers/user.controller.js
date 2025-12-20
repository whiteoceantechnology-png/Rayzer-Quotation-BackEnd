/**
 * User controller
 */

import Joi from 'joi';
import HTTPStatus from 'http-status';

import User from '../models/user.model.js';
import { hash } from 'bcrypt';
import logger from '../utils/logger.js';
import constants from '../config/constants.js';

const { ROLES } = constants;

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
    const hashedPassword = await hash(req.body.password, 10);
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
    const userProfile = await User.findByIdAndUpdate({ _id: req.user.id }, req.body, { new: true }).select('-password -_id');
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

export async function createSalesPerson(req, res, next) {
  try {
    const { email, password, username, first_name, last_name, mobile_number } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'User with this email or username already exists'
      });
    }

    const salesPerson = await User.create({
      email,
      password,
      username,
      first_name,
      last_name,
      mobile_number,
      role: ROLES.SALES_PERSON,
    });

    return res.status(HTTPStatus.CREATED).json({
      message: 'Sales person created successfully',
      status: 1,
      data: salesPerson.toJSON(),
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Create sales person error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function listSalesPersons(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const query = { role: ROLES.SALES_PERSON };

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { first_name: searchRegex },
        { last_name: searchRegex },
        { email: searchRegex },
        { username: searchRegex }
      ];
    }

    const [salesPersons, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Sales persons fetched',
      data: salesPersons,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List sales persons error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getSalesPerson(req, res, next) {
  try {
    const { id } = req.params;
    const salesPerson = await User.findOne({ _id: id, role: ROLES.SALES_PERSON }).select('-password');

    if (!salesPerson) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        status: 0,
        message: 'Sales person not found',
      });
    }

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Sales person fetched',
      data: salesPerson,
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get sales person error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function updateSalesPerson(req, res, next) {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Prevent sensitive updates through this API
    delete updates.password;
    delete updates.role;
    delete updates.email; // Usually email updates require verification, keeping simple for now or strictly disallow

    const salesPerson = await User.findOneAndUpdate(
      { _id: id, role: ROLES.SALES_PERSON },
      updates,
      { new: true }
    ).select('-password');

    if (!salesPerson) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        status: 0,
        message: 'Sales person not found',
      });
    }

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Sales person updated successfully',
      data: salesPerson
    });

  } catch (e) {
    (req.log || logger).error({ err: e }, 'Update sales person error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function deleteSalesPerson(req, res, next) {
  try {
    const { id } = req.params;

    const result = await User.findOneAndDelete({ _id: id, role: ROLES.SALES_PERSON });

    if (!result) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        status: 0,
        message: 'Sales person not found',
      });
    }

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Sales person deleted successfully',
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Delete sales person error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}