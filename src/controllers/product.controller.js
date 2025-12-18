import HTTPStatus from 'http-status';
import { Op } from 'sequelize';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';

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

export async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);
    const offset = (page - 1) * limit;

    const where = buildQuery(req.query);

    const { count, rows: items } = await Product.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      attributes: [
        'id', 'product', 'color', 'chipset', 'type', 'beam_angle',
        'ct', 'cri', 'drive', 'power_factor', 'drive_details',
        'warranty', 'dlp', 'mrp', 'created_at'
      ]
    });

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

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Products fetched',
      data: transformedItems,
      meta: { page, limit, total: count },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'List products error');
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
        'warranty', 'dlp', 'mrp', 'created_at', 'updated_at'
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
    const { type } = req.query;
    const where = {};
    if (type) where.type = type;

    const allProducts = await getDistinctValues('product', where);
    const sortedProducts = allProducts.sort();

    const total = sortedProducts.length;
    const paginatedProducts = sortedProducts.slice((page - 1) * limit, page * limit);

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

    const allTypes = await getDistinctValues('type');
    const sortedTypes = allTypes.sort();

    const total = sortedTypes.length;
    const paginatedTypes = sortedTypes.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Types fetched',
      data: paginatedTypes,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get types error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getBeamAngles(req, res, next) {
  try {
    let { product, type } = req.query;
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

    const beamAngles = await getDistinctValues('beam_angle', where);

    const sortedAngles = beamAngles
      .map(angle => {
        const num = parseInt(angle, 10);
        return isNaN(num) ? null : num;
      })
      .filter(angle => angle !== null)
      .sort((a, b) => a - b)
      .map(angle => angle.toString());

    const total = sortedAngles.length;
    const paginatedAngles = sortedAngles.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Beam angles fetched',
      data: paginatedAngles,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get beam angles error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getColors(req, res, next) {
  try {
    let { product, type, beam_angle } = req.query;
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
    if (beam_angle) where.beam_angle = beam_angle;

    const allColors = await getDistinctValues('color', where);
    const sortedColors = allColors.sort();

    const total = sortedColors.length;
    const paginatedColors = sortedColors.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Colors fetched',
      data: paginatedColors,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get colors error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getChipsets(req, res, next) {
  try {
    let { product, type, beam_angle, color } = req.query;
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

    const allChipsets = await getDistinctValues('chipset', where);
    const sortedChipsets = allChipsets.sort();

    const total = sortedChipsets.length;
    const paginatedChipsets = sortedChipsets.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Chipsets fetched',
      data: paginatedChipsets,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get chipsets error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getColorTemperatures(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset } = req.query;
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

    const cts = await getDistinctValues('ct', where);

    const sortedCts = cts
      .sort((a, b) => a - b)
      .map(ct => ct.toString());

    const total = sortedCts.length;
    const paginatedCts = sortedCts.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Color temperatures fetched',
      data: paginatedCts,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get color temperatures error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getCRI(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, ct } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    if (!product || !color || !chipset) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, chipset, parameters are required',
      });
    }

    const where = { product, color, chipset };
    if (ct) where.ct = ct;
    if (type) where.type = type;
    if (beam_angle) where.beam_angle = beam_angle;

    const cris = await getDistinctValues('cri', where);

    const sortedCris = cris
      .map(cri => cri.toString());

    const total = sortedCris.length;
    const paginatedCris = sortedCris.slice((page - 1) * limit, page * limit);

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'CRI values fetched',
      data: paginatedCris,
      meta: { page, limit, total },
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get CRI error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

export async function getDrivers(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, ct, cri } = req.query;
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

    const drivers = await Product.findAll({
      where,
      attributes: ['drive', 'power_factor', 'drive_details', 'warranty'],
      raw: true
    });

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

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Drivers fetched',
      data: paginatedDrivers,
      meta: { page, limit, total },
    });
  } catch (e) {
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

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Final product fetched',
      data: transformedProduct,
    });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get final product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}