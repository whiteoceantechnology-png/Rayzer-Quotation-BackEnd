/**
 * Configuration for the database
 */

import Sequelize from 'sequelize';
import logger from '../utils/logger.js';
import constants from './constants.js';

const sequelize = new Sequelize(constants.DB_URL, {
  dialect: 'mariadb',
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

sequelize.authenticate()
  .then(() => {
    logger.info('MariaDB connection established');
  })
  .catch(err => {
    logger.error({ err }, 'MariaDB connection error');
  });

export default sequelize;
