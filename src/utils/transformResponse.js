/**
 * Transform MongoDB _id to id in response objects
 * @param {Object|Array} data - Data to transform
 * @returns {Object|Array} Transformed data
 */
const IGNORED_TYPES = new Set(['[object Date]', '[object RegExp]']);

function isObjectId(value) {
  return (
    value &&
    typeof value === 'object' &&
    (value._bsontype === 'ObjectID' || value.constructor?.name === 'ObjectId') &&
    typeof value.toString === 'function'
  );
}

function toPlain(value) {
  if (value && typeof value.toObject === 'function') {
    return value.toObject({ virtuals: true });
  }
  if (value && typeof value.toJSON === 'function') {
    return value.toJSON({ virtuals: true });
  }
  return value;
}

export function transformId(data) {
  if (data == null) return data;

  if (Array.isArray(data)) {
    return data.map(item => transformId(item));
  }

  if (isObjectId(data)) {
    return data.toString();
  }

  if (data instanceof Map) {
    return transformId(Object.fromEntries(data.entries()));
  }

  const typeTag = Object.prototype.toString.call(data);
  if (IGNORED_TYPES.has(typeTag)) {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'object') {
    const plain = toPlain(data);
    if (plain == null || typeof plain !== 'object') {
      return plain;
    }

    const transformed = {};

    for (const [key, value] of Object.entries(plain)) {
      if (key === '_id') {
        transformed.id = transformId(value);
        continue;
      }
      transformed[key] = transformId(value);
    }

    return transformed;
  }

  return data;
}

/**
 * Middleware to transform all JSON responses
 */
export function transformResponseMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function transformedJson(payload) {
    return originalJson(transformId(payload));
  };

  next();
}