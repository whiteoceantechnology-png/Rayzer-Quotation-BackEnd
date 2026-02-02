import HTTPStatus from 'http-status';
import Joi from 'joi';
import path from 'path';
import fs from 'fs';
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
    const customer = await Customer.findByPk(req.body.customer_id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found', status: 0 });
    }

    // Fetch products and calculate totals
    const items = [];
    let subtotal = 0;

    // Optimize: Fetch all products in one go
    const productIds = req.body.items.map(i => i.product_id);
    const products = await Product.findAll({
      where: {
        id: { [Op.in]: productIds }
      },
      transaction
    });

    // Create Map for quick lookup
    const productMap = new Map();
    products.forEach(p => productMap.set(p.id, p));

    const invalidProductIds = [];
    for (const item of req.body.items) {
      // Sequelize ID is integer, ensure type match (req body might be string if not validated strictly)
      const product = productMap.get(Number(item.product_id));
      if (!product) {
        invalidProductIds.push(item.product_id);
        continue;
      }

      const totalPrice = product.mrp * item.quantity;
      subtotal += totalPrice;

      items.push({
        product_id: product.id,
        room_name: item.room_name || 'N/A',
        quantity: item.quantity,
        unit_price: product.mrp,
        dlp_total: product.dlp * item.quantity ?? 0,
        total_price: totalPrice,
      });
    }

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
    const discount = req.body.discount || 0;
    const totalAmount = subtotal - discount;
    const taxAmount = (totalAmount * taxRate) / 100;

    const bill = await Bill.create({
      customer_id: customer.id,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount: discount,
      total_amount: totalAmount,
      notes: req.body.notes,
      terms_conditions: req.body.terms_conditions,
      created_by: req.user.id,
      dlp_total: items.reduce((acc, curr) => acc + curr.dlp_total, 0),
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
    // Build where clause - Admin/Manager can access any bill
    const where = { id: req.params.id };
    const isAdminOrManager = req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
    if (!isAdminOrManager) {
      where.created_by = req.user.id;
    }

    const bill = await Bill.findOne({
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
        }
      ]
    });

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
    // Build where clause - Admin/Manager can generate PDF for any bill
    const where = { id: req.params.id };
    const isAdminOrManager = req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
    if (!isAdminOrManager) {
      where.created_by = req.user.id;
    }

    const bill = await Bill.findOne({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['name', 'mobile_number', 'company_name', 'location']
        },
        {
          model: BillItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['product', 'color', 'chipset', 'ct', 'cri', 'drive', 'power_factor', 'drive_details', 'warranty', 'dlp', 'mrp', 'image']
          }]
        },{
          model: User,
          as: 'creator',
          attributes: ['first_name', 'last_name', 'email', 'id', 'mobile_number']
        }
      ]
    });

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