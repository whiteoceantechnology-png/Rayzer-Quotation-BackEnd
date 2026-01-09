import { Router } from 'express';
import * as BillController from '../controllers/bill.controller.js';
import { authJwt } from '../services/auth.js';

const router = new Router();

/**
 * @swagger
 * tags:
 *   name: Bills
 *   description: Bill Management
 */

/**
 * @swagger
 * /bills:
 *   post:
 *     summary: Create a new bill
 *     tags: [Bills]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - items
 *             properties:
 *               customer_id:
 *                 type: string
 *                 description: Customer ID
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [product_id, quantity]
 *                   properties:
 *                     product_id:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     room_name:
 *                       type: string
 *               discount:
 *                 type: number
 *               notes:
 *                 type: string
 *               terms_conditions:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bill created
 */
router.post('/', authJwt, BillController.create);
/**
 * @swagger
 * /bills:
 *   get:
 *     summary: List bills
 *     tags: [Bills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent, paid, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: customer_id
 *         schema:
 *           type: string
 *         description: Filter by Customer ID
 *       - in: query
 *         name: sales_staff_id
 *         schema:
 *           type: string
 *         description: Filter by Sales Staff (User) ID
 *     responses:
 *       200:
 *         description: List of bills
 */
router.get('/', authJwt, BillController.list);
/**
 * @swagger
 * /bills/{id}:
 *   get:
 *     summary: Get bill by ID
 *     tags: [Bills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bill details
 */
router.get('/:id', authJwt, BillController.getById);
/**
 * @swagger
 * /bills/{id}/pdf:
 *   get:
 *     summary: Generate & Download Bill PDF Quotation
 *     description: |
 *       Generates a professional PDF quotation with:
 *       - Company header with logo
 *       - Customer and sales rep details
 *       - Products grouped by room name
 *       - Product images (supports base64 and file paths)
 *       - Rupee symbol (₹) with custom fonts
 *       - Discount, GST, and total calculations
 *       - Payment details (Cash/Account)
 *       - Terms and conditions page
 *       
 *       **PDF Format:** Landscape A4
 *     tags: [Bills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bill ID
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Bill not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/pdf', authJwt, BillController.generatePDF);

export default router;