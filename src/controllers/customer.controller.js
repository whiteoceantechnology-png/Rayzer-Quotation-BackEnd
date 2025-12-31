import HTTPStatus from 'http-status';
import Joi from 'joi';
import { Op } from 'sequelize';
import Customer from '../models/customer.model.js';
import logger from '../utils/logger.js';
import constants from '../config/constants.js';
import sharp from 'sharp';

const { ROLES } = constants;

export const validation = {
  create: {
    body: {
      name: Joi.string().min(1).required(),
      mobile_number: Joi.string().min(5).required(),
      company_name: Joi.string().allow('', null),
      location: Joi.string().allow('', null),
    },
  },
  update: {
    body: {
      name: Joi.string().min(1).optional(),
      mobile_number: Joi.string().min(5).optional(),
      company_name: Joi.string().optional().allow('', null),
      location: Joi.string().optional().allow('', null),
    },
  },
};

/**
 * Create a customer
 */
export async function create(req, res, next) {
  try {
    let quotation_image = null;
    if (req.file) {
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 })
        .toBuffer();
      quotation_image = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
    }

    const payload = {
      name: req.body.name,
      mobile_number: req.body.mobile_number,
      company_name: req.body.company_name,
      location: req.body.location,
      created_by: req.user && (req.user.id || req.user._id) ? (req.user.id || req.user._id) : null,
      quotation_image,
    };

    const customer = await Customer.create(payload);
    return res.status(HTTPStatus.CREATED).json({ message: 'Customer created', status: 1, data: customer });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * List customers created by the authenticated user (paginated with search)
 */
export async function list(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    requestLogger.debug({ query: req.query }, 'Listing customers');
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;

    // Build query

    const where = {};

    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
      where.created_by = userId;
    }

    // Search functionality
    if (req.query.search) {
      const searchPattern = `%${req.query.search}%`;
      where[Op.or] = [
        { name: { [Op.like]: searchPattern } },
        { company_name: { [Op.like]: searchPattern } },
      ];
    }

    // Individual field filters
    if (req.query.name) {
      where.name = { [Op.like]: `%${req.query.name}%` };
    }
    if (req.query.mobile_number) {
      where.mobile_number = { [Op.like]: `%${req.query.mobile_number}%` };
    }
    if (req.query.company_name) {
      where.company_name = { [Op.like]: `%${req.query.company_name}%` };
    }
    if (req.query.location) {
      where.location = { [Op.like]: `%${req.query.location}%` };
    }

    const { count, rows: items } = await Customer.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      attributes: ['id', 'name', 'mobile_number', 'company_name', 'location', 'created_by', 'created_at', 'updated_at']
    });

    return res.status(HTTPStatus.OK).json({
      message: 'Customers fetched',
      status: 1,
      data: items,
      meta: { page, limit, total: count },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List customers error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Get single customer by id
 */
export async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'Invalid id', status: 0 });
    }

    const where = { id };
    // Security: Only allow creator to view? Original code restricted it.

    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) where.created_by = userId;

    const customer = await Customer.findOne({ where });
    if (!customer) {
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found', status: 0 });
    }

    return res.status(HTTPStatus.OK).json({ message: 'Customer fetched', status: 1, data: customer });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Update customer (only creator can update)
 */
export async function update(req, res, next) {
  try {
    const _id = req.params.id;
    const updates = {};
    if (req.file) {
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 })
        .toBuffer();
      updates.quotation_image = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
    }

    ['name', 'mobile_number', 'company_name', 'location'].forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    const where = { id };
    
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) where.created_by = userId;


    const [updatedCount] = await Customer.update(updates, { where });

    if (updatedCount === 0) {
      // Check if it exists but not owned, or doesn't exist?
      // For simplicity just 404
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found or not owned by you', status: 0 });
    }

    // Fetch updated
    const updatedCustomer = await Customer.findByPk(id);

    return res.status(HTTPStatus.OK).json({ message: 'Customer updated', status: 1, data: updatedCustomer });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Delete customer (only creator/admin/manager can delete)
 */
export async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'Invalid id', status: 0 });
    }

    const where = { id };
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) where.created_by = userId;


    const deletedCount = await Customer.destroy({ where });

    if (deletedCount === 0) {
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found or not owned by you', status: 0 });
    }
    
    return res.status(HTTPStatus.OK).json({ message: 'Customer deleted', status: 1 });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}