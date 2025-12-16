import faker from 'faker';

import User from '../models/user.model.js';
import logger from '../utils/logger.js';

export async function userSeed(count) {
  try {
    const users = [];

  Array.from({ length: count || 10 }).map(() => {
    const fakeUser = {
      name: `${faker.name.firstName()} ${faker.name.lastName()}`,
      username: faker.internet.userName(),
      email: faker.internet.email(),
      password: 'password1',
      mobile_number: faker.phone.phoneNumber(),
      user_fname: faker.name.firstName(),
      school_name: faker.company.companyName(),
      setup_id: faker.random.number({ min: 100, max: 999 }),
      board: faker.random.arrayElement(['CBSE', 'ICSE', 'State Board']),
      class_name: faker.random.arrayElement(['10th', '11th', '12th']),
      dept_id: faker.random.number({ min: 1, max: 20 }),
      subject: faker.random.arrayElement(['Math', 'Science', 'History']),
      subject_id: faker.random.number({ min: 1, max: 50 }),
      medium: faker.random.arrayElement([1, 2]), // 1 for English, 2 for Hindi
    };
    return users.push(fakeUser);
  });
  const savePromises = users.map(u => new User(u).save());
  const savedUsers = await Promise.all(savePromises);
  return savedUsers;
  } catch (error) {
    logger.error({ err: error }, 'User seed error');
    return error
  }
}

export async function deleteUserSeed() {
  try {
    return await User.remove();
  } catch (e) {
    return e;
  }
}
