/* eslint-disable import/no-mutable-exports */

import mongoose, { Schema } from 'mongoose';
import { compareSync, hashSync } from 'bcrypt';
import jwt from 'jsonwebtoken';
import uniqueValidator from 'mongoose-unique-validator';

import constants from '../config/constants.js';

const { ROLES } = constants;

const UserSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      required: [true, 'Email is required!'],
      trim: true,
      validate: {
        validator(email) {
          const emailRegex = /^[-a-z0-9%S_+]+(\.[-a-z0-9%S_+]+)*@(?:[a-z0-9-]{1,63}\.){1,125}[a-z]{2,63}$/i;
          return emailRegex.test(email);
        },
        message: '{VALUE} is not a valid email!',
      },
    },
    mobile_number: {
      type: String,
      trim: true,
    },
    first_name: {
      type: String,
      trim: true,
    },
    last_name: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      unique: true,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.SALES_PERSON,
    },
    password: {
      type: String,
      required: [true, 'Password is required!'],
      trim: true,
      minlength: [6, 'Password need to be longer!'],
      validate: {
        validator(password) {
          // At least 6 chars and at least one digit
          return typeof password === 'string' && password.length >= 6 && /\d/.test(password);
        },
        message: 'Password must be at least 6 characters and contain a number!',
      },
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

UserSchema.plugin(uniqueValidator, {
  message: '{VALUE} already taken!',
});

// Hash the user password and assign user_id on creation
UserSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = this._hashPassword(this.password);
  }
  next();
});

UserSchema.methods = {
  /**
   * Favorites actions
   *
   * @public
   */
  /**
   * Authenticate the user
   *
   * @public
   * @param {String} password - provided by the user
   * @returns {Boolean} isMatch - password match
   */
  authenticateUser(password) {
    return compareSync(password, this.password);
  },
  /**
   * Hash the user password
   *
   * @private
   * @param {String} password - user password choose
   * @returns {String} password - hash password
   */
  _hashPassword(password) {
    return hashSync(password, 10);
  },

  /**
   * Generate a jwt token for authentication
   *
   * @public
   * @returns {String} token - JWT token
   */
  createToken() {
    return jwt.sign(
      {
        id: this._id,
      },
      constants.JWT_SECRET,
    );
  },

  /**
   * Parse the user object in data we wanted to send when is auth
   *
   * @public
   * @returns {Object} User - ready for auth
   */
  toAuthJSON() {
    return {
      access_token: `JWT ${this.createToken()}`,
      id: this._id,
      username: this.username,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      mobile_number: this.mobile_number,
      role: this.role,
    };
  },

  /**
   * Parse the user object in data we wanted to send
   *
   * @public
   * @returns {Object} User - ready for populate
   */
  toJSON() {
    return {
      id: this._id,
      username: this.username,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      mobile_number: this.mobile_number,
      role: this.role,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  },
};


const User = mongoose.model('User', UserSchema);


export default User;
