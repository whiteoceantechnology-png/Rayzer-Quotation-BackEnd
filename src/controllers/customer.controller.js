import HTTPStatus from 'http-status';
import Joi from 'joi';

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
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
      query.created_by = userId;
    }

    // Search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        // { mobile_number: searchRegex },
        { company_name: searchRegex },
        // { location: searchRegex },
      ];
    }

    // Individual field filters (optional)
    if (req.query.name) {
      query.name = new RegExp(req.query.name, 'i');
    }
    if (req.query.mobile_number) {
      query.mobile_number = new RegExp(req.query.mobile_number, 'i');
    }
    if (req.query.company_name) {
      query.company_name = new RegExp(req.query.company_name, 'i');
    }
    if (req.query.location) {
      query.location = new RegExp(req.query.location, 'i');
    }

    const [items, total] = await Promise.all([
      Customer.find(query)
        .sort('-created_at')
        .skip(skip)
        .limit(limit)
        .select('name mobile_number company_name location user_id created_at updated_at')
        .exec(),
      Customer.countDocuments(query).exec(),
    ]);

    return res.status(HTTPStatus.OK).json({
      message: 'Customers fetched',
      status: 1,
      data: items,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List customers error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Get single customer by numeric user_id
 */
export async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'Invalid id', status: 0 });
    }

    const query = { user_id: id };
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) query.created_by = userId;

    const customer = await Customer.findOne(query).exec();
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

    const query = { _id };
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) query.created_by = userId;

    const updated = await Customer.findOneAndUpdate(query, updates, { new: true, runValidators: true }).exec();
    if (!updated) {
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found or not owned by you', status: 0 });
    }

    return res.status(HTTPStatus.OK).json({ message: 'Customer updated', status: 1, data: updated });
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
    const _id = req.params.id;

    const query = { _id };
    const userId = req.user?.id || req.user?._id;
    if (userId && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) query.created_by = userId;
    const result = await Customer.deleteOne(query).exec();
    if (!result.deletedCount) {
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found or not owned by you', status: 0 });
    }

    return res.status(HTTPStatus.OK).json({ message: 'Customer deleted', status: 1 });
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}