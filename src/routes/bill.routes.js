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
 *               - customer
 *               - products
 *             properties:
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     price:
 *                       type: number
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
 *     summary: Generate Bill PDF
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
 *         description: PDF File
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/pdf', authJwt, BillController.generatePDF);

export default router;