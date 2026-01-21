/**
 * Configuration for the database
 */

import Sequelize from 'sequelize';
import logger from '../utils/logger.js';
import constants from './constants.js';

const sequelize = new Sequelize({
  database: constants.DB_NAME,
  username: constants.DB_USER,
  password: constants.DB_PASSWORD,
  host: constants.DB_HOST,
  dialect: 'mariadb',
  sync: { alter: true },
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
  },
  pool: {
    max: 20,           // Increased for bulk operations
    min: 2,            // Keep some connections warm
    acquire: 60000,    // 60s to acquire connection (up from 30s)
    idle: 30000,       // 30s idle before release
    evict: 60000       // Check for idle connections every 60s
  },
  dialectOptions: {
    connectTimeout: 60000,  // 60s connection timeout
  },
  retry: {
    max: 3             // Retry failed queries up to 3 times
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
