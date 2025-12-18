// require('dotenv').config();
 import 'dotenv/config.js';

const WHITELIST = {};

const devConfig = {
  JWT_SECRET: process.env.JWT_SECRET_DEV,
  DB_URL: process.env.DB_URL_DEV || 'mariadb://root:root@localhost:3306/rayzer_quotation_dev',
};

const testConfig = {
  JWT_SECRET: 'ewtijwebgiuweg9w98u9283982t!!u1h28h1t1h89u9h@$$',
  DB_URL: 'mariadb://root:root@localhost:3306/rayzer_quotation_test',
};

const prodConfig = {
  JWT_SECRET: process.env.JWT_SECRET_PROD,
  DB_URL: process.env.DB_URL_PROD,
};

const defaultConfig = {
  PORT: process.env.PORT || 3000,
  RAVEN_ID: process.env.RAVEN_ID,
  WHITELIST,
};

function envConfig(env) {
  switch (env) {
    case 'development':
      return devConfig;
    case 'test':
      return testConfig;
    default:
      return prodConfig;
  }
}

export default {
  ...defaultConfig,
  ...envConfig(process.env.NODE_ENV),
};
