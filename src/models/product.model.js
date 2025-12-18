import Sequelize, { Model } from 'sequelize';
import sequelize from '../config/database.js';

class Product extends Model { }

Product.init({
  product: {
    type: Sequelize.STRING,
    allowNull: false
  },
  color: Sequelize.STRING,
  chipset: Sequelize.STRING,
  type: Sequelize.STRING,
  beam_angle: Sequelize.STRING,
  ct: Sequelize.STRING,
  cri: Sequelize.STRING,
  drive: Sequelize.STRING,
  power_factor: Sequelize.STRING,
  drive_details: Sequelize.STRING,
  warranty: Sequelize.STRING,
  dlp: Sequelize.FLOAT,
  mrp: Sequelize.FLOAT, // lowercase mrp
  image: {
    type: Sequelize.STRING,
    defaultValue: ''
  },
  MRP: { // Uppercase MRP
    type: Sequelize.FLOAT,
    defaultValue: 0
  }
}, {
  sequelize,
  modelName: 'Product',
  tableName: 'products',
  underscored: true,
  indexes: [
    {
      name: 'product_composite_index',
      fields: ['product', 'color', 'chipset', 'ct', 'beam_angle', 'type']
    },
    // Fulltext index support varies by MariaDB version and table engine (InnoDB/MyISAM).
    // Sequelize supports it via literal or specific index type.
    {
      type: 'FULLTEXT',
      name: 'product_text_index',
      fields: ['product', 'color', 'chipset', 'ct', 'cri', 'drive', 'warranty']
    },
    // Single column indexes
    { fields: ['product'] },
    { fields: ['color'] },
    { fields: ['chipset'] },
    { fields: ['ct'] },
    { fields: ['created_at'] }
  ]
});

export default Product;