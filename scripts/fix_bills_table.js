import 'dotenv/config.js';
import Sequelize, { QueryTypes } from 'sequelize';
import constants from '../src/config/constants.js';

const sequelize = new Sequelize({
  database: constants.DB_NAME,
  username: constants.DB_USER,
  password: constants.DB_PASSWORD,
  host: constants.DB_HOST,
  dialect: 'mariadb',
  logging: console.log,
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');

    // 1. Get all indexes on bills table
    const indexes = await sequelize.query(`SHOW INDEX FROM bills`, { type: QueryTypes.SELECT });
    console.log(`Total indexes on bills table: ${indexes.length}`);

    // 2. Group indexes by name, keep track of duplicates (excluding PRIMARY)
    const seen = new Set();
    const toDrop = [];
    for (const row of indexes) {
      const name = row.Key_name;
      if (name === 'PRIMARY') continue;
      if (seen.has(name)) {
        toDrop.push(name);
      } else {
        seen.add(name);
      }
    }

    // Drop unique duplicates by name
    const uniqueToDrop = [...new Set(toDrop)];
    console.log(`Duplicate indexes to drop: ${uniqueToDrop.join(', ') || 'none'}`);

    for (const idxName of uniqueToDrop) {
      // Count how many with this name exist - need to drop all but one
      const count = indexes.filter(r => r.Key_name === idxName).length;
      console.log(`Dropping ${count - 1} duplicate(s) of index: ${idxName}`);
      for (let i = 0; i < count - 1; i++) {
        await sequelize.query(`ALTER TABLE bills DROP INDEX \`${idxName}\``);
      }
    }

    // 3. Check current columns
    const cols = await sequelize.query(`SHOW COLUMNS FROM bills`, { type: QueryTypes.SELECT });
    const colNames = cols.map(c => c.Field);
    console.log('Current columns:', colNames.join(', '));

    // 4. Add missing columns
    if (!colNames.includes('discount_type')) {
      console.log('Adding discount_type column...');
      await sequelize.query(`ALTER TABLE bills ADD COLUMN discount_type INT NULL DEFAULT NULL, ALGORITHM=INSTANT`);
      console.log('discount_type added.');
    } else {
      console.log('discount_type already exists, skipping.');
    }

    if (!colNames.includes('discount_value')) {
      console.log('Adding discount_value column...');
      await sequelize.query(`ALTER TABLE bills ADD COLUMN discount_value FLOAT NULL DEFAULT NULL, ALGORITHM=INSTANT`);
      console.log('discount_value added.');
    } else {
      console.log('discount_value already exists, skipping.');
    }

    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
