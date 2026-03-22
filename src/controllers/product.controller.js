import HTTPStatus from 'http-status';
import { Op } from 'sequelize';
import Product from '../models/product.model.js';

import logger from '../utils/logger.js';
import CacheService from '../services/cache.js';
import crypto from 'crypto';
import sharp from 'sharp';

const CACHE_TTL = 3600; // 1 hour

const generateCacheKey = (prefix, data) => {
  const hash = crypto.createHash('md5').update(JSON.stringify(data || {})).digest('hex');
  return `${prefix}:${hash}`;
};

function buildQuery(q) {
  const where = {};
  const { search, product, color, chipset, ct, cri, drive, type, beam_angle } = q;

  // Exact filters
  if (product) where.product = product;
  if (color) where.color = color;
  if (chipset) where.chipset = chipset;
  if (ct) where.ct = ct;
  if (cri) where.cri = cri;
  if (drive) where.drive = drive;
  if (type) where.type = type;
  if (beam_angle) where.beam_angle = beam_angle;

  // Free text search
  if (search) {
    const searchPattern = `%${search}%`;
    where[Op.or] = [
      { product: { [Op.like]: searchPattern } },
      { color: { [Op.like]: searchPattern } },
      { chipset: { [Op.like]: searchPattern } },
      { type: { [Op.like]: searchPattern } },
      { beam_angle: { [Op.like]: searchPattern } },
      { ct: { [Op.like]: searchPattern } },
      { cri: { [Op.like]: searchPattern } },
      { drive: { [Op.like]: searchPattern } },
      { power_factor: { [Op.like]: searchPattern } },
      { drive_details: { [Op.like]: searchPattern } },
      { warranty: { [Op.like]: searchPattern } },
    ];
  }

  return where;
}

function buildTokenizedSearch(tokens) {
  const searchableFields = [
    'product',
    'color',
    'chipset',
    'type',
    'beam_angle',
    'ct',
    'cri',
    'drive',
    'power_factor',
    'drive_details',
    'warranty',
  ];

  return {
    [Op.and]: tokens.map(token => ({
      [Op.or]: searchableFields.map(field => ({
        [field]: { [Op.like]: `%${token}%` },
      })),
    })),
  };
}

function buildListWhere(query, { useFullText = true } = {}) {
  const where = {};
  const { product, color, chipset, ct, cri, drive, type, beam_angle, search } = query;

  if (product) where.product = product;
  if (color) where.color = color;
  if (chipset) where.chipset = chipset;
  if (ct) where.ct = ct;
  if (cri) where.cri = cri;
  if (drive) where.drive = drive;
  if (type) where.type = type;
  if (beam_angle) where.beam_angle = beam_angle;

  const tokens = String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return where;
  }

  const fullTextTokens = tokens
    .map(token => token.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(token => token.length >= 3);

  if (useFullText && fullTextTokens.length) {
    const booleanModeQuery = fullTextTokens.map(token => `+${token}*`).join(' ');
    return {
      ...where,
      [Op.and]: [
        Product.sequelize.literal(
          `MATCH (product, color, chipset, ct, cri, drive, warranty) AGAINST (${Product.sequelize.escape(booleanModeQuery)} IN BOOLEAN MODE)`
        ),
      ],
    };
  }

  return {
    ...where,
    ...buildTokenizedSearch(tokens),
  };
}

export async function createProduct(req, res, next) {
  try {
    const { product, color, chipset, ct, cri, drive, type, beam_angle, power_factor, drive_details, warranty, dlp, mrp } = req.body;

    let base64Image = '';
    if (req.file) {
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 })
        .toBuffer();
      base64Image = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
    }

    const savedProduct = await Product.create({
      product,
      color,
      chipset,
      ct,
      cri,
      drive,
      type,
      beam_angle,
      power_factor,
      drive_details,
      warranty,
      dlp,
      mrp,
      image: base64Image
    });
    return res.status(HTTPStatus.CREATED).json({
      message: 'Product created',
      status: 1,
      data: savedProduct,
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Create product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ status: 0, message: 'Invalid product id' });
    }

    const updates = { ...req.body };
    delete updates.id;
    delete updates._id;
    delete updates.created_at;
    delete updates.updated_at;

    if (req.file) {
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 })
        .toBuffer();
      updates.image = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
    }

    // Sequelize: update and fetch updated product
    await Product.update(updates, { where: { id } });
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(HTTPStatus.NOT_FOUND).json({ status: 0, message: 'Product not found' });
    }

    // Invalidate cache as product data changed
    // CacheService.clear();

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Product updated',
      data: product,
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Update product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    const requestLogger = req.log || logger;

    // Check if product exists
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(HTTPStatus.NOT_FOUND).json({ status: 0, message: 'Product not found' });
    }

    // Delete product
    await product.destroy();

    // Invalidate cache
    try {
      CacheService.clear();
    } catch (cacheErr) {
      requestLogger.warn({ err: cacheErr }, 'Failed to clear cache');
    }

    requestLogger.info({ productId: id }, 'Product deleted');

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Product deleted successfully',
    });
  } catch (e) {
    console.error(e);
    (req.log || logger).error({ err: e }, 'Delete product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);
    const offset = (page - 1) * limit;

    const cacheKey = generateCacheKey('products:list', { ...req.query, page, limit });
    const cachedResult = await CacheService.get(cacheKey);
    if (cachedResult) {
      return res.status(HTTPStatus.OK).json({
        ...cachedResult,
        message: 'Products fetched (cached)',
      });
    }

    const listAttributes = [
      'id', 'product', 'color', 'chipset', 'type', 'beam_angle',
      'ct', 'cri', 'drive', 'power_factor', 'drive_details',
      'warranty', 'dlp', 'mrp', 'image', 'created_at'
    ];

    let where = buildListWhere(req.query);
    let count;
    let items;

    try {
      [count, items] = await Promise.all([
        Product.count({ where }),
        Product.findAll({
          where,
          order: [['created_at', 'DESC']],
          offset,
          limit,
          attributes: listAttributes,
        }),
      ]);
    } catch (searchError) {
      const shouldFallback =
        req.query.search &&
        /match|fulltext|against/i.test(searchError?.message || '');

      if (!shouldFallback) {
        throw searchError;
      }

      where = buildListWhere(req.query, { useFullText: false });
      [count, items] = await Promise.all([
        Product.count({ where }),
        Product.findAll({
          where,
          order: [['created_at', 'DESC']],
          offset,
          limit,
          attributes: listAttributes,
        }),
      ]);
    }

    const transformedItems = items.map(item => {
      const plain = item.toJSON();
      const displayName = [
        plain.product,
        plain.color,
        plain.chipset,
        plain.ct ? `${plain.ct}K` : null,
        plain.cri ? `CRI${plain.cri}` : null,
        plain.drive,
      ]
        .filter(Boolean)
        .join(' - ');

      plain.displayName = displayName.replace(/\s+/g, '');
      return plain;
    });

    const result = {
      status: 1,
      message: 'Products fetched',
      data: transformedItems,
      meta: { page, limit, total: count },
    };

    await CacheService.set(cacheKey, result, CACHE_TTL);

    (req.log || logger).debug(
      { page, limit, returned: items.length, total: count, cached: false },
      'Products list retrieved'
    );

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    console.error(e);
    (req.log || logger).error({ err: e }, 'List products error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function listAll(req, res, next) {
  try {
    const products = await Product.findAll({
      order: [['created_at', 'DESC']],
      attributes: [
        'product', 'color', 'chipset', 'type', 'beam_angle',
        'ct', 'cri', 'drive', 'power_factor', 'drive_details',
        'warranty', 'dlp', 'mrp', 'created_at'
      ]
    });

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'All products fetched',
      data: products,
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List all products error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}


export async function getById(req, res, next) {
  try {
    const { id } = req.params;
    // Sequelize findByPk handles ID
    const product = await Product.findByPk(id, {
      attributes: [
        'id', 'product', 'color', 'chipset', 'type', 'beam_angle',
        'ct', 'cri', 'drive', 'power_factor', 'drive_details',
        'warranty', 'dlp', 'mrp', 'image', 'created_at', 'updated_at'
      ]
    });

    if (!product) {
      return res.status(HTTPStatus.NOT_FOUND).json({ status: 0, message: 'Product not found' });
    }

    return res.status(HTTPStatus.OK).json({ status: 1, message: 'Product fetched', data: product });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get product error');
    // Check if error is due to invalid ID format (though Sequelize usually handles int/uuid gracefully or throws specific error)
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

// Helper to get distinct values
async function getDistinctValues(field, where = {}) {
  const results = await Product.findAll({
    where,
    attributes: [
      [Product.sequelize.fn('DISTINCT', Product.sequelize.col(field)), field]
    ],
    raw: true
  });
  return results.map(r => r[field]).filter(Boolean);
}

// Note: Pagination on distinct values in memory is what the original code effectively did (mostly),
// or it relied on mongo returning array.
// Here we fetch all distinct then paginate in memory for consistency with previous logic.

export async function getProducts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const { type, search } = req.query;
    const where = {};
    if (type) where.type = type;
    if(search){
      where.product = { [Op.like]: `%${req.query.search}%` };
    }

    const allProducts = await getDistinctValues('product', where);
    const sortedProducts = allProducts.sort();

    const total = sortedProducts.length;
    const paginatedProducts = sortedProducts.slice((page - 1) * limit, page * limit);

    const cacheKey = generateCacheKey('products:selection:products', req.query);
    await CacheService.set(cacheKey, paginatedProducts, CACHE_TTL);
    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Products fetched',
      data: paginatedProducts,
      meta: { page, limit, total },
    });

  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get products error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getTypes(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const where = {};
    if(req.query.search){
      where.type = { [Op.like]: `%${req.query.search}%` };
    }
    const allTypes = await getDistinctValues('type', where);
    const sortedTypes = allTypes.sort();

    const total = sortedTypes.length;
    const paginatedTypes = sortedTypes.slice((page - 1) * limit, page * limit);

    const result = {
      status: 1,
      message: 'Types fetched',
      data: paginatedTypes,
      meta: { page, limit, total },
    };

    const cacheKey = generateCacheKey('products:selection:types', req.query);
    await CacheService.set(cacheKey, result, CACHE_TTL);

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get types error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getBeamAngles(req, res, next) {
  try {
    let { product, type, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product parameter is required',
      });
    }

    const where = { product };
    if (type) where.type = type;
    if (search) where.beam_angle = { [Op.like]: `%${search}%` };
    const beamAngles = await getDistinctValues('beam_angle', where);
    console.log('Distinct beam angles:', beamAngles);
    const cacheKey = generateCacheKey('products:selection:beamangles', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Beam angles fetched (cached)' });
    }



    // Sort numerically
    const sortedAngles = beamAngles
      .sort((a, b) => a - b)
      .map(angle => angle);

    const total = sortedAngles.length;
    const paginatedAngles = sortedAngles.slice((page - 1) * limit, page * limit);

    const result = {
      status: 1,
      message: 'Beam angles fetched',
      data: paginatedAngles,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);
    return res.status(HTTPStatus.OK).json(result);

  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get beam angles error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getColors(req, res, next) {
  try {
    let { product, type, beam_angle, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;

    if (!product) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product parameter is required',
      });
    }

    const where = { product };
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;
    if (search) where.color = { [Op.like]: `%${search}%` };

    const allColors = await getDistinctValues('color', where);
    const sortedColors = allColors.sort();

    const cacheKey = generateCacheKey('products:selection:colors', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      (req.log || logger).info({ cacheKey }, 'Cache hit for product colors');
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Colors fetched (cached)' });
    } else {
      (req.log || logger).debug({ cacheKey }, 'Cache miss for product colors');
    }

    // Apply pagination
    const total = sortedColors.length;
    const paginatedColors = sortedColors.slice(skip, skip + limit);

    const result = {
      status: 1,
      message: 'Colors fetched',
      data: paginatedColors,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);
    (req.log || logger).info({ cacheKey }, 'Cache set for product colors');
    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get colors error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getChipsets(req, res, next) {
  try {
    let { product, type, beam_angle, color, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product || !color) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product and color parameters are required',
      });
    }

    const where = { product, color };
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;
    if (search) where.chipset = { [Op.like]: `%${search}%` };

    const allChipsets = await getDistinctValues('chipset', where);
    const sortedChipsets = allChipsets.sort();

    // Apply pagination
    const total = sortedChipsets.length;
    const paginatedChipsets = sortedChipsets.slice((page - 1) * limit, page * limit);

    const cacheKey = generateCacheKey('products:selection:chipsets', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      (req.log || logger).info({ cacheKey }, 'Cache hit for product chipsets');
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Chipsets fetched (cached)' });
    } else {
      (req.log || logger).debug({ cacheKey }, 'Cache miss for product chipsets');
    }

    const result = {
      status: 1,
      message: 'Chipsets fetched',
      data: paginatedChipsets,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);
    (req.log || logger).info({ cacheKey }, 'Cache set for product chipsets');
    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get chipsets error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getColorTemperatures(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product || !color || !chipset) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, and chipset parameters are required',
      });
    }

    const where = { product, color, chipset };
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;
    if (search) where.ct = { [Op.like]: `%${search}%` };
    const cts = await getDistinctValues('ct', where);

    const cacheKey = generateCacheKey('products:selection:ct', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Color temperatures fetched (cached)' });
    }


    // Sort numerically
    const sortedCts = cts
      .sort((a, b) => a - b)
      .map(ct => ct.toString());

    // Apply pagination
    const total = sortedCts.length;
    const paginatedCts = sortedCts.slice((page - 1) * limit, page * limit);


    const result = {
      status: 1,
      message: 'Color temperatures fetched',
      data: paginatedCts,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get color temperatures error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getCRI(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, ct, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product || !color || !chipset) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, chipset, parameters are required',
      });
    }

    const where = { product, color, chipset };
    if (search) where.cri = { [Op.like]: `%${search}%` };
    if (ct) where.ct = ct;
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;

    const cris = await getDistinctValues('cri', where);

    const cacheKey = generateCacheKey('products:selection:cri', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'CRI values fetched (cached)' });
    }

    // Sort numerically
    const sortedCris = cris
      .map(cri => cri.toString());

    // Apply pagination
    const total = sortedCris.length;
    const paginatedCris = sortedCris.slice((page - 1) * limit, page * limit);


    const result = {
      status: 1,
      message: 'CRI values fetched',
      data: paginatedCris,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get CRI error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getDrivers(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    let { product, type, beam_angle, color, chipset, ct, cri, search } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product || !color || !chipset || !ct || !cri) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, chipset, ct, and cri parameters are required',
      });
    }

    const where = { product, color, chipset, ct, cri };
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;
    if (search) where.drive = { [Op.like]: `%${search}%` };
    
    requestLogger.debug({ where }, 'Fetching drivers');
    const drivers = await Product.findAll({
      where,
      attributes: ['drive', 'power_factor', 'drive_details', 'warranty'],
      raw: true
    });

    const cacheKey = generateCacheKey('products:selection:drivers', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Drivers fetched (cached)' });
    }

    const uniqueDrivers = [];
    const driverMap = new Map();

    drivers.forEach((item) => {
      if (item.drive && !driverMap.has(item.drive)) {
        driverMap.set(item.drive, item);
        uniqueDrivers.push(item);
      }
    });

    const total = uniqueDrivers.length;
    const paginatedDrivers = uniqueDrivers.slice((page - 1) * limit, page * limit);

    const result = {
      status: 1,
      message: 'Drivers fetched',
      data: paginatedDrivers,
      meta: { page, limit, total },
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    console.error(e);
    (req.log || logger).error({ err: e }, 'Get drivers error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getFinalProduct(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, ct, cri, drive } = req.query;

    if (!product || !color || !chipset || !ct || !cri || !drive) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'All parameters are required: product, color, chipset, ct, cri, drive',
      });
    }

    const where = { product, color, chipset, ct, cri, drive };
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;

    const finalProduct = await Product.findOne({
      where,
      raw: true
    });

    const cacheKey = generateCacheKey('products:selection:final', req.query);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      return res.status(HTTPStatus.OK).json({ ...cachedData, message: 'Final product fetched (cached)' });
    }

    if (!finalProduct) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        status: 0,
        message: 'Product not found with selected combination',
      });
    }

    const displayParts = [
      finalProduct.product,
      finalProduct.type,
      finalProduct.beam_angle ? `${finalProduct.beam_angle}°` : null,
      finalProduct.color,
      finalProduct.chipset,
      finalProduct.ct ? `${finalProduct.ct}K` : null,
      finalProduct.cri ? `CRI${finalProduct.cri}` : null,
      finalProduct.drive,
    ].filter(Boolean);

    const transformedProduct = {
      id: finalProduct.id.toString(), // Sequelize id is integer, convert if needed
      product: finalProduct.product,
      type: finalProduct.type,
      beam_angle: finalProduct.beam_angle,
      color: finalProduct.color,
      chipset: finalProduct.chipset,
      ct: finalProduct.ct,
      cri: finalProduct.cri,
      drive: finalProduct.drive,
      power_factor: finalProduct.power_factor,
      drive_details: finalProduct.drive_details,
      warranty: finalProduct.warranty,
      dlp: finalProduct.dlp,
      mrp: finalProduct.mrp,
      image: finalProduct.image,
      displayName: displayParts.join(' - '),
    };

    const result = {
      status: 1,
      message: 'Final product fetched',
      data: transformedProduct,
    };
    await CacheService.set(cacheKey, result, CACHE_TTL);

    return res.status(HTTPStatus.OK).json(result);
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get final product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}
