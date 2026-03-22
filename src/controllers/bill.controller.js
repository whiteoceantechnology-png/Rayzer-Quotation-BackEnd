import HTTPStatus from 'http-status';
import Joi from 'joi';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Bill, { BillItem } from '../models/bill.model.js';
import Customer from '../models/customer.model.js';
import Product from '../models/product.model.js';
import { generateBillPDF } from '../services/pdfGenerator.js';
import logger from '../utils/logger.js';
import constants from '../config/constants.js';
import User from '../models/user.model.js';

const { ROLES } = constants;
const SHARE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function canManageAnyBill(user) {
  return user.role === ROLES.ADMIN || user.role === ROLES.MANAGER;
}

function buildBillAccessWhere(req, id) {
  const where = { id };
  if (!canManageAnyBill(req.user)) {
    where.created_by = req.user.id;
  }
  return where;
}

function normalizeBillPayload(body = {}) {
  return {
    customer_id: body.customer_id,
    items: Array.isArray(body.items) ? body.items : [],
    discount: Number(body.discount || 0),
    notes: body.notes,
    terms_conditions: body.terms_conditions,
    status: body.status,
  };
}

function createShareToken(billId, expiresAt) {
  const secret = constants.JWT_SECRET || process.env.JWT_SECRET_PROD || 'rayzer-share-secret';
  const payload = `${billId}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${expiresAt}.${signature}`;
}

function verifyShareToken(billId, token) {
  if (!token || typeof token !== 'string') return false;

  const [expiresAtRaw, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);

  if (!expiresAt || !signature || Date.now() > expiresAt) {
    return false;
  }

  const expected = createShareToken(billId, expiresAt).split('.')[1];
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function buildShareUrl(req, billId) {
  const expiresAt = Date.now() + SHARE_TOKEN_TTL_MS;
  const token = createShareToken(billId, expiresAt);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/api/bills/shared/${billId}/pdf?token=${encodeURIComponent(token)}`;
}

async function resolveBillItems(itemsPayload, transaction) {
  const items = [];
  let subtotal = 0;

  const productIds = itemsPayload.map(item => Number(item.product_id)).filter(Boolean);
  const products = await Product.findAll({
    where: { id: { [Op.in]: productIds } },
    transaction
  });
  const productMap = new Map();
  products.forEach(product => productMap.set(product.id, product));

  const invalidProductIds = [];

  for (const item of itemsPayload) {
    const product = productMap.get(Number(item.product_id));
    if (!product) {
      invalidProductIds.push(item.product_id);
      continue;
    }

    const quantity = Number(item.quantity);
    const totalPrice = product.mrp * quantity;
    subtotal += totalPrice;

    items.push({
      product_id: product.id,
      room_name: item.room_name || 'N/A',
      quantity,
      unit_price: product.mrp,
      dlp_total: (product.dlp || 0) * quantity,
      total_price: totalPrice,
    });
  }

  return {
    items,
    subtotal,
    invalidProductIds,
    dlp_total: items.reduce((acc, curr) => acc + curr.dlp_total, 0),
  };
}

async function fetchBillWithRelations(where) {
  return Bill.findOne({
    where,
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['name', 'mobile_number', 'company_name', 'location', 'id']
      },
      {
        model: BillItem,
        as: 'items',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['product', 'color', 'chipset', 'ct', 'cri', 'drive', 'power_factor', 'drive_details', 'warranty', 'dlp', 'mrp', 'image']
        }]
      },
      {
        model: User,
        as: 'creator',
        attributes: ['first_name', 'last_name', 'email', 'id', 'mobile_number']
      }
    ]
  });
}

export const validation = {
  create: {
    body: {
      customer_id: Joi.number().required(), // Sequelize IDs are numbers
      items: Joi.array().min(1).items(
        Joi.object({
          product_id: Joi.number().required(),
          quantity: Joi.number().min(1).required(),
          room_name: Joi.string().optional().allow('', null)
        }),
      ).required(),
      discount: Joi.number().min(0).optional(),
      notes: Joi.string().optional().allow('', null),
      terms_conditions: Joi.string().optional().allow('', null),
    },
  },
};

export async function create(req, res, next) {
  const transaction = await sequelize.transaction();
  try {
    const payload = normalizeBillPayload(req.body);
    const customer = await Customer.findByPk(payload.customer_id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found', status: 0 });
    }

    // Fetch products and calculate totals
    const { items, subtotal, invalidProductIds, dlp_total } = await resolveBillItems(payload.items, transaction);

    // Check if any valid items exist
    if (items.length === 0) {
      await transaction.rollback();
      return res.status(HTTPStatus.BAD_REQUEST).json({
        message: 'No valid products found in items',
        status: 0,
        invalid_product_ids: invalidProductIds
      });
    }

    // Warn about invalid products but continue
    if (invalidProductIds.length > 0) {
      (req.log || logger).warn({ invalidProductIds }, 'Some products not found while creating bill');
    }

    const taxRate = 18;
    const discount = payload.discount || 0;
    const totalAmount = subtotal - discount;
    const taxAmount = (totalAmount * taxRate) / 100;

    const bill = await Bill.create({
      customer_id: customer.id,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount: discount,
      total_amount: totalAmount,
      notes: payload.notes,
      terms_conditions: payload.terms_conditions,
      created_by: req.user.id,
      dlp_total,
      items: items // Nested creation
    }, {
      include: [{ model: BillItem, as: 'items' }],
      transaction
    });

    await transaction.commit();

    return res.status(HTTPStatus.CREATED).json({
      message: 'Bill created',
      status: 1,
      data: bill,
      ...(invalidProductIds.length > 0 && { skipped_product_ids: invalidProductIds })
    });
  } catch (e) {
    await transaction.rollback();
    (req.log || logger).error({ err: e }, 'Create bill error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function update(req, res, next) {
  const transaction = await sequelize.transaction();
  try {
    const payload = normalizeBillPayload(req.body);
    const where = buildBillAccessWhere(req, req.params.id);
    const bill = await Bill.findOne({ where, include: [{ model: BillItem, as: 'items' }], transaction });

    if (!bill) {
      await transaction.rollback();
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    const customer = await Customer.findByPk(payload.customer_id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found', status: 0 });
    }

    const { items, subtotal, invalidProductIds, dlp_total } = await resolveBillItems(payload.items, transaction);

    if (items.length === 0) {
      await transaction.rollback();
      return res.status(HTTPStatus.BAD_REQUEST).json({
        message: 'No valid products found in items',
        status: 0,
        invalid_product_ids: invalidProductIds
      });
    }

    const taxRate = 18;
    const discount = payload.discount || 0;
    const totalAmount = subtotal - discount;
    const taxAmount = (totalAmount * taxRate) / 100;

    await bill.update({
      customer_id: customer.id,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      total_amount: totalAmount,
      notes: payload.notes,
      terms_conditions: payload.terms_conditions,
      dlp_total,
      ...(payload.status ? { status: payload.status } : {}),
    }, { transaction });

    await BillItem.destroy({ where: { bill_id: bill.id }, transaction });
    await BillItem.bulkCreate(
      items.map(item => ({
        ...item,
        bill_id: bill.id,
      })),
      { transaction }
    );

    await transaction.commit();

    const updatedBill = await fetchBillWithRelations({ id: bill.id });
    return res.status(HTTPStatus.OK).json({
      message: 'Bill updated',
      status: 1,
      data: updatedBill,
      ...(invalidProductIds.length > 0 && { skipped_product_ids: invalidProductIds })
    });
  } catch (e) {
    await transaction.rollback();
    (req.log || logger).error({ err: e }, 'Update bill error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;

    const where = {};
    
    // Admin and Manager can see all bills, others see only their own
    const isAdminOrManager = req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
    if (!isAdminOrManager) {
      where.created_by = req.user.id;
    }
    
    if (req.query.status) where.status = req.query.status;
    if (req.query.customer_id) where.customer_id = req.query.customer_id;
    // Allow Admin/Manager to filter by creator
    if (req.query.created_by && isAdminOrManager) {
      where.created_by = req.query.created_by || req.query.sales_staff;
    }
    if (req.query.date) {
      const inputDate = new Date(req.query.date);

      // Start of the day
      const startOfDay = new Date(inputDate);
      startOfDay.setHours(0, 0, 0, 0);

      // Start of next day
      const startOfNextDay = new Date(startOfDay);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);

      where.created_at = {
        [Op.gte]: startOfDay,
        [Op.lt]: startOfNextDay
      };
    }

    if(req.query.start_date && req.query.end_date) {
      const startDate = new Date(req.query.start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(req.query.end_date);
      endDate.setHours(23, 59, 59, 999);

      where.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate
        // [Op.between]: [startDate, endDate]
      };
    }
    console.log(where);
    const { count, rows: bills } = await Bill.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['name', 'mobile_number', 'company_name', 'location', 'id']
        },
        {
          model: BillItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['product', 'color', 'chipset']
          }]
        }
      ],
      distinct: true // Important for correct count with includes
    });

    const transformedBills = bills.map(bill => {
      const b = bill.toJSON();

      // Transform keys to match old API if frontend expects 'customer_details'
      b.customer_details = b.customer;
      delete b.customer;
      delete b.customer_id; // Sequelize keeps FK field usually

      if (b.items) {
        b.items = b.items.map(item => {
          if (item.product) {
            item.product_name = item.product.product;
            // Original code deleted product_id (which was the object in Mongoose populate).
            // Here item.product is the object. item.product_id is likely the FK integer.
            // We can mimic the structure:
            // Old structure: items: [{ product_id: { product: '...'}, ... }] -> mapped to have product_name
            // We have: items: [{ product: { product: '...' }, product_id: 1, ... }]
            delete item.product;
          }
          return item;
        });
      }
      return b;
    });

    return res.status(HTTPStatus.OK).json({
      message: 'Bills fetched',
      status: 1,
      data: transformedBills,
      meta: { page, limit, total: count }
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List bills error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getById(req, res, next) {
  try {
    const bill = await fetchBillWithRelations(buildBillAccessWhere(req, req.params.id));

    if (!bill) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    const data = bill.toJSON();
    data.customer_details = data.customer;
    delete data.customer;

    if (data.items) {
      data.items = data.items.map(item => {
        if (item.product) {
          item.product_details = item.product;
          item.display_details = `${item.product.color} - ${item.product.chipset} - ${item.product.ct} - ${item.product.cri} - ${item.product.drive} - ${item.product.power_factor} - ${item.product.drive_details} - ${item.product.warranty} - DLP: ${item.product.dlp} - MRP: ${item.product.mrp}`;
          delete item.product;
        }
        return item;
      });
    }

    return res.status(HTTPStatus.OK).json({
      message: 'Bill fetched',
      status: 1,
      data
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get bill error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function generatePDF(req, res, next) {
  try {
    const bill = await fetchBillWithRelations(buildBillAccessWhere(req, req.params.id));

    if (!bill) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    const billData = bill.toJSON();
    // Transform needed for PDF generator? Assuming generator expects same structure as getById result
    // The original code passed `bill.toObject()` directly to generator, then saved to file.
    // The generator might rely on `customer_id` being the customer object (due to populate).
    // In Sequelize `toJSON` puts customer in `customer` key.
    // We should map it to what generator expects.
    billData.customer_id = billData.customer; // Alias for compatibility with PDF generator if it uses customer_id property

    // Map items to include product details embedded if needed
    // Original Mongoose populate put product in `item.product_id`.
    // Generator likely checks `item.product_id.field`.
    billData.items.forEach(item => {
      if (item.product) {
        item.product_id = item.product; // Alias for compatibility
      }
    });

    const uploadsDir = path.join(process.cwd(), 'uploads', 'bills');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${billData.bill_number}.pdf`;
    const filepath = path.join(uploadsDir, filename);
    console.log(billData)
    await generateBillPDF(billData, filepath);

    return res.download(filepath, filename, err => {
      if (err) {
        (req.log || logger).error({ err }, 'Bill PDF download error');
        return next(err);
      }
      return undefined;
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Generate PDF error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
};

export async function getShareLink(req, res, next) {
  try {
    const bill = await Bill.findOne({
      where: buildBillAccessWhere(req, req.params.id),
      attributes: ['id', 'bill_number']
    });

    if (!bill) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    return res.status(HTTPStatus.OK).json({
      message: 'Share link generated',
      status: 1,
      data: {
        bill_id: bill.id,
        bill_number: bill.bill_number,
        share_url: buildShareUrl(req, bill.id),
        expires_in_days: 30,
      }
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get share link error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function generateSharedPDF(req, res, next) {
  try {
    const { id } = req.params;
    const { token } = req.query;

    if (!verifyShareToken(id, token)) {
      return res.status(HTTPStatus.UNAUTHORIZED).json({
        message: 'Invalid or expired share link',
        status: 0
      });
    }

    const bill = await fetchBillWithRelations({ id });
    if (!bill) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    const billData = bill.toJSON();
    billData.customer_id = billData.customer;
    billData.items.forEach(item => {
      if (item.product) {
        item.product_id = item.product;
      }
    });

    const uploadsDir = path.join(process.cwd(), 'uploads', 'bills');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${billData.bill_number}.pdf`;
    const filepath = path.join(uploadsDir, filename);
    await generateBillPDF(billData, filepath);

    return res.download(filepath, filename, err => {
      if (err) {
        (req.log || logger).error({ err }, 'Shared bill PDF download error');
        return next(err);
      }
      return undefined;
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Generate shared PDF error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}
