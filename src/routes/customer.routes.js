import { Router } from 'express';
import validate from 'express-validation';

import * as CustomerController from '../controllers/customer.controller.js';
import { authJwt } from '../services/auth.js';

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
  CustomerController.remove,
);

export default router;