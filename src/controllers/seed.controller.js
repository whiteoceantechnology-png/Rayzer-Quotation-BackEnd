/**
 * Seed controller for fill your db of fake data
 */

import HTTPStatus from 'http-status';
import { userSeed, deleteUserSeed } from '../seeds/user.seed.js';

export async function seedUsers(req, res, next) {
  try {
    await userSeed(req.params.count);

    return res
      .status(HTTPStatus.OK)
      .send(`User seed success! Created ${req.params.count || 10} users!`);
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function clearSeedUsers(req, res, next) {
  try {
    await deleteUserSeed();

    return res.status(HTTPStatus.OK).send('User collection empty');
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Take all your model and clear it
 */
export async function clearAll(req, res, next) {
  try {
    await deleteUserSeed();
    // Add other clears if needed

    return res.status(HTTPStatus.OK).send('All collections clear');
  } catch (e) {
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}
