import httpStatus from 'http-status';

/**
 * @extends Error
 */
class ExtendableError extends Error {
  constructor(message, status, isPublic) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.status = status;
    this.isPublic = isPublic;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor.name);
  }
}

/**
 * Class representing an API error.
 *
 * @extends ExtendableError
 */
class APIError extends ExtendableError {
  /**
   * Creates an API error.
   *
   * @param {String} message - Error message.
   * @param {Number} status - HTTP status code of error.
   * @param {Boolean} isPublic - Whether the message should be visible to user or not.
   */
  constructor(
    message,
    status = httpStatus.INTERNAL_SERVER_ERROR,
    isPublic = false,
  ) {
    super(message, status, isPublic);
  }
}

/**
 * Class for required error
 *
 * @class RequiredError
 */
export class RequiredError {
  /**
   * Make error pretty
   *
   * @static
   * @param {Array} errors - Array of error Object
   * @returns {Object} - errors - Pretty Object transform
   */
  static makePretty(errors) {
    if (!Array.isArray(errors) || errors.length === 0) {
      return {};
    }
    return errors.reduce((obj, error) => {
      if (!error || typeof error !== 'object') {
        return obj;
      }
      const nObj = obj;
      // Support both Joi (field/messages) and Sequelize (path/message) error formats
      const field = error.field || error.path || 'unknown';
      const messages = error.messages;
      const message = (Array.isArray(messages) && messages.length > 0 ? messages[0] : null) 
        || error.message 
        || 'Validation error';
      nObj[field] = String(message).replace(/"/g, '');
      return nObj;
    }, {});
  }
}

export default APIError;
