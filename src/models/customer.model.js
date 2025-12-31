import Sequelize, { Model } from 'sequelize';
import sequelize from '../config/database.js';
import User from './user.model.js';

class Customer extends Model { }

Customer.init({
  name: {
    type: Sequelize.STRING,
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Name is required' }
    }
  },
  mobile_number: {
    type: Sequelize.STRING,
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Mobile number is required' }
    }
  },
  company_name: {
    type: Sequelize.STRING
  },
  location: {
    type: Sequelize.STRING
  },
  quotation_image: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  created_by: {
    type: Sequelize.INTEGER, // Assuming User.id is Integer (default in Sequelize). If UUID, change this.
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    }
  }
}, {
  sequelize,
  modelName: 'Customer',
  tableName: 'customers',
  underscored: true,
  indexes: [
    { fields: ['created_by'] },
    { fields: ['name'] },
    { fields: ['mobile_number'] },
    { fields: ['company_name'] },
    { fields: ['created_at'] }
  ]
});

// Define Association
Customer.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default Customer;