import { Router } from 'express';
import validate from 'express-validation';

import * as CustomerController from '../controllers/customer.controller.js';
import { authJwt } from '../services/auth.js';
import { checkRole } from '../middlewares/rbac.middleware.js';
import constants from '../config/constants.js';

const { ROLES } = constants;

const router = new Router();

router.post(
  '/',
  // validate(CustomerController.validation.create),
  authJwt,
  CustomerController.create,
);

router.get(
  '/',
  authJwt,
  CustomerController.list,
);

router.get(
  '/:id',
  authJwt,
  CustomerController.getById,
);

router.put(
  '/:id',
  // validate(CustomerController.validation.update),
  authJwt,
  CustomerController.update,
);

router.delete(
  '/:id',
  authJwt,
  checkRole([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_PERSON]),
  CustomerController.remove,
);

export default router;