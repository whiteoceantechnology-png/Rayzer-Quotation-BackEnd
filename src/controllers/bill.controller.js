import HTTPStatus from 'http-status';
import Joi from 'joi';
import path from 'path';
import fs from 'fs';
import Bill from '../models/bill.model.js';
import Customer from '../models/customer.model.js';
import Product from '../models/product.model.js';
import { generateBillPDF } from '../services/pdfGenerator.js';
import logger from '../utils/logger.js';
import { Mongoose } from 'mongoose';
import constants from '../config/constants.js';

const { ROLES } = constants;

export const validation = {
  create: {
    body: {
      customer_id: Joi.string().required(),
      items: Joi.array().min(1).items(
        Joi.object({
          product_id: Joi.string().required(),
          quantity: Joi.number().min(1).required(),
        }),
      ).required(),
      discount: Joi.number().min(0).optional(),
      notes: Joi.string().optional(),
      terms_conditions: Joi.string().optional(),
    },
  },
};

export async function create(req, res, next) {
  try {
    const customer = await Customer.findById(req.body.customer_id);
    if (!customer) {
      return res.status(HTTPStatus.NOT_FOUND).json({ message: 'Customer not found', status: 0 });
    }

    // Fetch products and calculate totals
    const items = [];
    let subtotal = 0;

    for (const item of req.body.items) {
      const product = await Product.findById(item.product_id);
      if (!product) continue;

      const totalPrice = product.mrp * item.quantity;
      subtotal += totalPrice;

      items.push({
        product_id: product._id,
        product_name: product.product,
        room_name: item.room_name || 'N/A',
        description: `${product.color} - ${product.chipset}`,
        quantity: item.quantity,
        unit_price: product.mrp,
        total_price: totalPrice,
      });
    }

    const taxRate = 18;
    const taxAmount = (subtotal * taxRate) / 100;
    const discount = req.body.discount || 0;
    const totalAmount = subtotal + taxAmount - discount;

    const bill = await Bill.create({
      customer_id: customer._id,
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      total_amount: totalAmount,
      notes: req.body.notes,
      terms_conditions: req.body.terms_conditions,
      created_by: req.user._id,
    });
    return res.status(HTTPStatus.CREATED).json({
      message: 'Bill created',
      status: 1,
      data: bill
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Create bill error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const skip = (page - 1) * limit;

    const query = {};

    // Security logic: SALESPERSON can only see their own bills
    if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
      query.created_by = req.user._id;
    } else if (req.query.sales_staff_id) {
      // ADMIN/MANAGER can filter by sales staff
      query.created_by = req.query.sales_staff_id;
    }

    if (req.query.status) query.status = req.query.status;
    if (req.query.customer_id) query.customer_id = req.query.customer_id;

    if (req.query.date) {
      const startOfDay = new Date(req.query.date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(req.query.date);
      endOfDay.setHours(23, 59, 59, 999);

      query.created_at = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }

    let [bills, total] = await Promise.all([
      Bill.find(query)
        .sort('-created_at')
        .skip(skip)
        .limit(limit)
        .populate('customer_id', 'name mobile_number company_name location')
        .populate('items.product_id', 'product color chipset')
        .allowDiskUse().exec(),
      Bill.countDocuments(query),
    ]);

    bills = bills.map(bill => {
      bill = bill.toObject();
      bill.customer_details = bill.customer_id;
      delete bill.customer_id;
      bill.items = bill.items.map(item => {
        if (item.product_id) {
          item.product_name = item.product_id.product;
          delete item.product_id;
        }
        return item;
      });
      return bill;
    });
    return res.status(HTTPStatus.OK).json({
      message: 'Bills fetched',
      status: 1,
      data: bills,
      meta: { page, limit, total }
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List bills error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getById(req, res, next) {
  try {
    const query = { _id: req.params.id };
    if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
      query.created_by = req.user._id;
    }

    const billDetail = await Bill.findOne(query)
      .populate('customer_id', 'name mobile_number company_name location')
      .populate('items.product_id', 'product color chipset ct cri drive power_factor drive_details warranty dlp mrp image')
      .exec();

    if (!billDetail) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    const data = billDetail.toObject();
    data.customer_details = data.customer_id;
    delete data.customer_id;
    data.items = data.items.map(item => {
      if (item.product_id) {
        item.product_details = item.product_id
        item.display_details = `${item.product_id.color} - ${item.product_id.chipset} - ${item.product_id.ct} - ${item.product_id.cri} - ${item.product_id.drive} - ${item.product_id.power_factor} - ${item.product_id.drive_details} - ${item.product_id.warranty} - DLP: ${item.product_id.dlp} - MRP: ${item.product_id.mrp}`;
        delete item.product_id;
      }
      return item;
    });
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
    const query = { _id: req.params.id };
    if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
      query.created_by = req.user._id;
    }

    const bill = await Bill.findOne(query)
      .populate('customer_id', 'name mobile_number company_name location')
      .populate('items.product_id', 'product color chipset ct cri drive power_factor drive_details warranty dlp mrp image')
      .exec();

    if (!bill) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'Bill not found',
        status: 0
      });
    }

    // Convert to plain object for PDF generation
    const billData = bill.toObject();

    // // Group items by room_name for PDF sections
    // const grouped = {};
    // (billData.items || []).forEach(item => {
    //   const room = item.room_name || 'Other';
    //   if (!grouped[room]) grouped[room] = [];
    //   grouped[room].push(item);
    // });
    // billData.sections = Object.entries(grouped).map(([room, items]) => ({
    //   name: room,
    //   items
    // }));

    const uploadsDir = path.join(process.cwd(), 'uploads', 'bills');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${billData.bill_number}.pdf`;
    const filepath = path.join(uploadsDir, filename);
    console.log('Generating PDF at:', billData);
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