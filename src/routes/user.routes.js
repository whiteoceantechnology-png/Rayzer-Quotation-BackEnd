/**
 * User Routes
 */

import { Router } from 'express';
import validate from 'express-validation';

import * as UserController from '../controllers/user.controller.js';
import * as AuthenticationController from '../controllers/authentication.controller.js';
import { authLocal, authJwt } from '../services/auth.js';

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

export default routes;
