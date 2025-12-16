/**
 * Configuration for the database
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import constants from './constants.js';

// Global plugin to add 'id' as virtual alias for '_id'
mongoose.plugin((schema) => {
  // Add virtual 'id' field that returns _id as string
  schema.virtual('id').get(function() {
    return this._id ? this._id.toString() : null;
  });

  // Configure toJSON to include virtuals and exclude _id
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
      delete ret._id;
      return ret;
    },
  });

  // Configure toObject to include virtuals and exclude _id
  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
      delete ret._id;
      return ret;
    },
  });
});

mongoose.Promise = global.Promise;

try {
  mongoose.connect(constants.MONGO_URL, {});
} catch (err) {
  mongoose.createConnection(constants.MONGO_URL, {});
}

mongoose.connection
  .once('open', () => {
    logger.info('MongoDB connection established');
  })
  .on('error', error => {
    logger.error({ err: error }, 'MongoDB connection error');
    throw error;
  });

export default mongoose;
