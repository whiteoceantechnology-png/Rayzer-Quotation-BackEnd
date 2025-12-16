/**
 * API Routes
 */

import { Router } from 'express';
import HTTPStatus from 'http-status';

import BillRoutes from './bill.routes.js';
import CustomerRoutes from './customer.routes.js';
import ProductRoutes from './product.routes.js';
import UserRoutes from './user.routes.js';
import SeedRoutes from './seed.routes.js';

import APIError from '../services/error.js';

// Middlewares
import logErrorService from '../services/log.js';

const routes = new Router();

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

routes.use('/customers', CustomerRoutes);
routes.use('/products', ProductRoutes);
routes.use('/users', UserRoutes);
routes.use('/bills', BillRoutes);

if (isDev || isTest) {
  routes.use('/seeds', SeedRoutes);
}

routes.all('*', (req, res, next) =>
  next(new APIError('Not Found!', HTTPStatus.NOT_FOUND, true)),
);

routes.use(logErrorService);

export default routes;
