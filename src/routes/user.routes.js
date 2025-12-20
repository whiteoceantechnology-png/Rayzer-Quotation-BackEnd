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

routes.post(
  '/signup',
  // validate(UserController.validation.create),
  UserController.create,
);
routes.post(
  '/reset',
  // validate(UserController.validation.create),
  authJwt,
  UserController.resetPassword,
);
routes.post(
  '/login',
  // validate(AuthenticationController.validation.login),
  authLocal,
  AuthenticationController.login,
);
routes.get(
  '/profile',
  // validate(AuthenticationController.validation.login),
  authJwt,
  AuthenticationController.getProfile,
);
routes.patch(
  '/profile',
  // validate(AuthenticationController.validation.login),
  authJwt,
  UserController.updateProfile,
);



// Sales Person Management Routes (Admin Only)
routes.post(
  '/sales-persons',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.createSalesPerson
);

routes.get(
  '/sales-persons',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.listSalesPersons
);

routes.get(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.getSalesPerson
);

routes.patch(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.updateSalesPerson
);

routes.delete(
  '/sales-persons/:id',
  authJwt,
  checkRole([ROLES.ADMIN]),
  UserController.deleteSalesPerson
);

export default routes;
