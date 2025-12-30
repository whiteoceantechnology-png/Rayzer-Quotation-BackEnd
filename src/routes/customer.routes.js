import { Router } from 'express';
import validate from 'express-validation';

import * as CustomerController from '../controllers/customer.controller.js';
import { authJwt } from '../services/auth.js';
import { checkRole } from '../middlewares/rbac.middleware.js';
import constants from '../config/constants.js';
import { uploadImage } from '../utils/multer.js';
const { ROLES } = constants;

const router = new Router();

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer Management
 */

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create a new customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - mobile_number
 *             properties:
 *               name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               company_name:
 *                 type: string
 *               location:
 *                 type: string
 *               quotation_image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Customer created
 *       400:
 *         description: Bad request
 */
router.post(
  '/',
  // validate(CustomerController.validation.create),
  authJwt,
  uploadImage.single('quotation_image'),
  CustomerController.create,
);

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: List customers
 *     tags: [Customers]
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
 *         description: List of customers
 */
router.get(
  '/',
  authJwt,
  CustomerController.list,
);

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     tags: [Customers]
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
 *         description: Customer details
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  authJwt,
  CustomerController.getById,
);

/**
 * @swagger
 * /customers/{id}:
 *   put:
 *     summary: Update customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               company_name:
 *                 type: string
 *               location:
 *                 type: string
 *               quotation_image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Customer updated
 */
router.put(
  '/:id',
  // validate(CustomerController.validation.update),
  authJwt,
  uploadImage.single('quotation_image'),
  CustomerController.update,
);

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Delete customer
 *     tags: [Customers]
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
 *         description: Customer deleted
 */
router.delete(
  '/:id',
  authJwt,
  checkRole([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_PERSON]),
  CustomerController.remove,
);

export default router;