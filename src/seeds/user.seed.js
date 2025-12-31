import { faker } from '@faker-js/faker';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

export async function userSeed(count) {
  try {
    const users = [];

    Array.from({ length: count || 10 }).forEach(() => {
      const fakeUser = {
        first_name: faker.name.firstName(),
        last_name: faker.name.lastName(),
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: 'password1', // Will be hashed by hook
        mobile_number: faker.phone.phoneNumber(),
        // Extra fields ignored by Sequelize model definition
      };
      users.push(fakeUser);
    });

    // bulkCreate calls hooks (for password hashing) only if individualHooks: true
    const savedUsers = await User.bulkCreate(users, { individualHooks: true });
    return savedUsers;
  } catch (error) {
    logger.error({ err: error }, 'User seed error');
    return error;
  }
}

export async function deleteUserSeed() {
  try {
    return await User.destroy({ where: {}, truncate: true });
  } catch (e) {
    return e;
  }
}
