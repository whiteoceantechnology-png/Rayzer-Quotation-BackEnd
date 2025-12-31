/* eslint-disable import/no-mutable-exports */

import Sequelize, { Model } from 'sequelize';
import { compareSync, hashSync } from 'bcrypt';
import jwt from 'jsonwebtoken';
import constants from '../config/constants.js';
import sequelize from '../config/database.js';
const { ROLES } = constants;
class User extends Model {
  /**
   * Authenticate the user
   *
   * @public
   * @param {String} password - provided by the user
   * @returns {Boolean} isMatch - password match
   */
  authenticateUser(password) {
    return compareSync(password, this.password);
  }

  /**
   * Generate a jwt token for authentication
   *
   * @public
   * @returns {String} token - JWT token
   */
  createToken() {
    return jwt.sign(
      {
        id: this.id, // Sequelize uses 'id' by default
      },
      constants.JWT_SECRET,
    );
  }

  /**
   * Parse the user object in data we wanted to send when is auth
   *
   * @public
   * @returns {Object} User - ready for auth
   */
  toAuthJSON() {
    return {
      access_token: `JWT ${this.createToken()}`,
      id: this.id,
      username: this.username,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      mobile_number: this.mobile_number,
      role: this.role,
    };
  }

  /**
   * Parse the user object in data we wanted to send
   *
   * @public
   * @returns {Object} User - ready for populate
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      mobile_number: this.mobile_number,
      role: this.role || ROLES.SALES_PERSON,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  static _hashPassword(password) {
    return hashSync(password, 10);
  }
}

// SUGGESTION: Ensure indexes on frequently queried fields for performance
// Example:
// User.init({
//   ...fields...
// }, {
//   indexes: [
//     { fields: ['email'], unique: true },
//     { fields: ['username'], unique: true },
//     { fields: ['role'] },
//   ]
// });
User.init({
  email: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: {
      msg: 'Email already exists'
    },
    validate: {
      notEmpty: { msg: 'Email is required!' },
      isEmail: { msg: 'Email is not valid!' }
    }
  },
  mobile_number: {
    type: Sequelize.STRING,
    validate: {
      // trim is handled by setter if needed or input sanitization, 
      // Sequelize doesn't have auto-trim in model definition like Mongoose, 
      // but we can add a setter.
    }
  },
  first_name: {
    type: Sequelize.STRING,
  },
  last_name: {
    type: Sequelize.STRING,
  },
  username: {
    type: Sequelize.STRING,
    unique: {
      msg: 'Username already exists'
    }
  },
  password: {
    type: Sequelize.STRING,
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Password is required!' },
      len: {
        args: [6, 100],
        msg: 'Password must be at least 6 characters!'
      },
      is: {
        args: /\d/,
        msg: 'Password must contain a number!'
      }
    }
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users',
  hooks: {
    beforeCreate: (user) => {
      if (user.password) {
        user.password = User._hashPassword(user.password);
      }
    },
    beforeUpdate: (user) => {
      if (user.changed('password')) {
        user.password = User._hashPassword(user.password);
      }
    }
  }
});

// Sync model with database (optional, better to migrate properly in real prod, but for this task/dev ok)
// We might want to call sync somewhere centrally, but for now strict portability:
// User.sync(); // Avoid calling sync in model file to prevent side effects on import.

export default User;
