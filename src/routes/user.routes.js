/**
 * User Routes
 */

import { Router } from 'express';
import validate from 'express-validation';

import * as UserController from '../controllers/user.controller.js';
import * as AuthenticationController from '../controllers/authentication.controller.js';
import { authLocal, authJwt } from '../services/auth.js';
import { checkRole } from '../middlewares/rbac.middleware.js';
import constants from '../config/constants.js';

const { ROLES } = constants;

const routes = new Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User Management and Authentication
 */

/**
 * @swagger
 * /users/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Bad request
 */
routes.post(
  '/signup',
  // validate(UserController.validation.create),
  UserController.create,
);
/**
 * @swagger
 * /users/reset:
 *   post:
 *     summary: Reset password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 *       401:
 *         description: Unauthorized
 */
routes.post(
  '/reset',
  // validate(UserController.validation.create),
  authJwt,
  UserController.resetPassword,
);
/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 default: demo@demo.com
 *               password:
 *                 type: string
 *                 default: 123456
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 _id:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
routes.post(
  '/login',
  // validate(AuthenticationController.validation.login),
  authLocal,
  AuthenticationController.login,
);
/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 */
routes.get(
  '/profile',
  // validate(AuthenticationController.validation.login),
  authJwt,
  AuthenticationController.getProfile,
);
/**
 * @swagger
 * /users/profile:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Unauthorized
 */
routes.patch(
  '/profile',
  // validate(AuthenticationController.validation.login),
  authJwt,
  UserController.updateProfile,
);

/**
 * @swagger
 * tags:
 *   name: Sales Persons
 *   description: Sales Person Management API
 */

/**
 * @swagger
 * /users/sales-persons:
 *   post:
 *     summary: Create a new sales person
 *     tags: [Sales Persons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               dlp_percent:
 *                 type: string
 *                 enum: [dlp, dlp_5, dlp_15, dlp_20]
 *     responses:
 *       201:
 *         description: Sales person created successfully
 *       400:
 *         description: Bad request (user already exists or invalid data)
 */
// Sales Person Management Routes (Admin Only)
routes.post(
  '/sales-persons',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.createSalesPerson,
);

/**
 * @swagger
 * /users/sales-persons:
 *   get:
 *     summary: List all sales persons
 *     tags: [Sales Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query (name, email, username)
 *     responses:
 *       200:
 *         description: List of sales persons
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
routes.get(
  '/sales-persons',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.listSalesPersons,
);

/**
 * @swagger
 * /users/sales-persons/{id}:
 *   get:
 *     summary: Get a sales person by ID
 *     tags: [Sales Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Sales person details
 *       404:
 *         description: Sales person not found
 */
routes.get(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.getSalesPerson,
);

/**
 * @swagger
 * /users/sales-persons/{id}:
 *   patch:
 *     summary: Update a sales person
 *     tags: [Sales Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               dlp_percent:
 *                 type: string
 *                 enum: [dlp, dlp_5, dlp_15, dlp_20]
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
routes.patch(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.updateSalesPerson,
);

/**
 * @swagger
 * /users/sales-persons/{id}:
 *   delete:
 *     summary: Delete a sales person
 *     tags: [Sales Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
routes.delete(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.deleteSalesPerson,
);

export default routes;
