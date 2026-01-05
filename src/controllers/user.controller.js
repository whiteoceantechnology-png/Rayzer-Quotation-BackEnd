/**
 * User controller
 */

import Joi from 'joi';
import HTTPStatus from 'http-status';

import User from '../models/user.model.js';
import CacheService from '../services/cache.js';
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

export async function createSalesPerson(req, res, next) {
  try {
    const { email, password, username, first_name, last_name, mobile_number } = req.body;

    const { Op } = (await import('sequelize'));
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { email },
          { username }
        ]
      }
    });
    console.log(existingUser);
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

    // Invalidate all sales persons list cache
    if (CacheService.client) {
      const keys = CacheService.client.keys().filter(k => k.startsWith('salesPersons:list:'));
      keys.forEach(k => CacheService.client.del(k));
      (req.log || logger).info({ keys }, 'Cache invalidated for sales persons list');
    }

    return res.status(HTTPStatus.CREATED).json({
      message: 'Sales person created successfully',
      status: 1,
      data: salesPerson.toJSON(),
    });
  } catch (e) {
    console.log(e);
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

    // Generate cache key based on query params
    const cacheKey = `salesPersons:list:${page}:${limit}:${req.query.search || ''}`;
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      (req.log || logger).info({ cacheKey }, 'Cache hit for sales persons list');
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Sales persons fetched (cached)' });
    } else {
      (req.log || logger).debug({ cacheKey }, 'Cache miss for sales persons list');
    }

    // Build Sequelize where clause
    const where = { role: ROLES.SALES_PERSON };
    if (req.query.search) {
      const { Op } = (await import('sequelize'));
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${req.query.search}%` } },
        { last_name: { [Op.iLike]: `%${req.query.search}%` } },
        { email: { [Op.iLike]: `%${req.query.search}%` } },
        { username: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const [salesPersons, total] = await Promise.all([
      User.findAll({
        where,
        attributes: { exclude: ['password'] },
        order: [['created_at', 'DESC']],
        offset: skip,
        limit,
      }),
      User.count({ where }),
    ]);

    const result = {
      status: 1,
      message: 'Sales persons fetched',
      data: salesPersons,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, 600); // 10 min TTL for user list
    (req.log || logger).info({ cacheKey }, 'Cache set for sales persons list');
    return res.status(HTTPStatus.OK).json(result);
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