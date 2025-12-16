import HTTPStatus from 'http-status';
import mongoose from 'mongoose';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';

function buildQuery(q) {
  const query = {};
  const { search, product, color, chipset, ct, cri, drive, type, beam_angle } = q;

  // Exact filters (these take precedence over search)
  if (product) query.product = product;
  if (color) query.color = color;
  if (chipset) query.chipset = chipset;
  if (ct) query.ct = ct;
  if (cri) query.cri = cri;
  if (drive) query.drive = drive;
  if (type) query.type = type;
  if (beam_angle) query.beam_angle = beam_angle;

  // Free text search across common fields
  if (search) {
    const rx = new RegExp(search, 'i');
    query.$or = [
      { product: rx },
      { color: rx },
      { chipset: rx },
      { type: rx },
      { beam_angle: rx },
      { ct: rx },
      { cri: rx },
      { drive: rx },
      { power_factor: rx },
      { drive_details: rx },
      { warranty: rx },
    ];
  }
  
  return query;
}

export async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);
    const skip = (page - 1) * limit;

    const query = buildQuery(req.query);

    let [items, total] = await Promise.all([
      Product.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .select({
          product: 1,
          color: 1,
          chipset: 1,
          type: 1,
          beam_angle: 1,
          ct: 1,
          cri: 1,
          drive: 1,
          power_factor: 1,
          drive_details: 1,
          warranty: 1,
          dlp: 1,
          mrp: 1,
          created_at: 1,
        }).exec(),
      Product.countDocuments(query).exec(),
    ]);
    items = items.map(item => {
      const plain = item.toObject();
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

    (req.log || logger).debug(
      { page, limit, total, returned: items.length },
      'Products list retrieved',
    );

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Products fetched',
      data: items,
      meta: { page, limit, total },
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
    if (!mongoose.isValidObjectId(id)) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ status: 0, message: 'Invalid product id' });
    }

    const product = await Product.findById(id)
      .select({
        product: 1,
        color: 1,
        chipset: 1,
        type: 1,
        beam_angle: 1,
        ct: 1,
        cri: 1,
        drive: 1,
        power_factor: 1,
        drive_details: 1,
        warranty: 1,
        dlp: 1,
        mrp: 1,
        created_at: 1,
        updated_at: 1,
      })
      
      .exec();

    if (!product) {
      return res.status(HTTPStatus.NOT_FOUND).json({ status: 0, message: 'Product not found' });
    }

    return res.status(HTTPStatus.OK).json({ status: 1, message: 'Product fetched', data: product });
  } catch (e) {
    (req.log || logger).error({ err: e }, 'Get product error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}

/**
 * Step 1: Get unique products with wattage (with pagination)
 * GET /api/products/selection?page=1&limit=20
 */
export async function getProducts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    const { type } = req.query;

    // Get all unique products
    const allProducts = await Product.distinct('product', {type}).exec();
    const sortedProducts = allProducts.filter(Boolean).sort();
    
    // Apply pagination
    const total = sortedProducts.length;
    const paginatedProducts = sortedProducts.slice(skip, skip + limit);
    
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

/**
 * Step 2: Get types for selected product (with pagination)
 * GET /api/products/selection/type?product=Katana 7w&page=1&limit=20
 */
export async function getTypes(req, res, next) {
  try {
    const { product } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    // if (!product) {
    //   return res.status(HTTPStatus.BAD_REQUEST).json({
    //     status: 0,
    //     message: 'Product parameter is required',
    //   });
    // }

    const allTypes = await Product.distinct('type').exec();
    const sortedTypes = allTypes.filter(Boolean).sort();
    
    // Apply pagination
    const total = sortedTypes.length;
    const paginatedTypes = sortedTypes.slice(skip, skip + limit);

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

/**
 * Step 3: Get beam angles for selected product and type (with pagination)
 * GET /api/products/selection/beamangle?product=Katana 7w&type=Spot&page=1&limit=20
 */
export async function getBeamAngles(req, res, next) {
  try {
    let { product, type } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    if (!product) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product parameter is required',
      });
    }

    const query = { product };
    if (type) query.type = type;

    const beamAngles = await Product.distinct('beam_angle', query).exec();
    
    // Sort numerically
    const sortedAngles = beamAngles
      .filter(Boolean)
      .map(angle => {
        const num = parseInt(angle, 10);
        return isNaN(num) ? null : num;
      })
      .filter(angle => angle !== null)
      .sort((a, b) => a - b)
      .map(angle => angle.toString());
    
    // Apply pagination
    const total = sortedAngles.length;
    const paginatedAngles = sortedAngles.slice(skip, skip + limit);
    
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

/**
 * Step 4: Get colors for selected product, type, and beam angle (with pagination)
 * GET /api/products/selection/colors?product=Katana 7w&type=Spot&beam_angle=15&page=1&limit=20
 */
export async function getColors(req, res, next) {
  try {
    let { product, type, beam_angle } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    if (!product) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product parameter is required',
      });
    }

    const query = { product };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;

    const allColors = await Product.distinct('color', query).exec();
    const sortedColors = allColors.filter(Boolean).sort();
    
    // Apply pagination
    const total = sortedColors.length;
    const paginatedColors = sortedColors.slice(skip, skip + limit);
    
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

/**
 * Step 5: Get chipsets for selected combination (with pagination)
 * GET /api/products/selection/chipsets?product=Katana 7w&type=Spot&beam_angle=15&color=White&page=1&limit=20
 */
export async function getChipsets(req, res, next) {
  try {
    let { product, type, beam_angle, color } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;

    if (!product || !color) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product and color parameters are required',
      });
    }

    const query = { product, color };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;

    const allChipsets = await Product.distinct('chipset', query).exec();
    const sortedChipsets = allChipsets.filter(Boolean).sort();
    
    // Apply pagination
    const total = sortedChipsets.length;
    const paginatedChipsets = sortedChipsets.slice(skip, skip + limit);
    
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

/**
 * Step 6: Get color temperatures for selected chipset (with pagination)
 * GET /api/products/selection/ct?product=Katana 7w&type=Spot&beam_angle=15&color=White&chipset=Standard&page=1&limit=20
 */
export async function getColorTemperatures(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    if (!product || !color || !chipset) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, and chipset parameters are required',
      });
    }

    const query = { product, color, chipset };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;

    const cts = await Product.distinct('ct', query).exec();
    
    // Sort numerically
    const sortedCts = cts
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map(ct => ct.toString());
    
    // Apply pagination
    const total = sortedCts.length;
    const paginatedCts = sortedCts.slice(skip, skip + limit);
    
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

/**
 * Step 7: Get CRI values for selected chipset and CT (with pagination)
 * GET /api/products/selection/cri?product=Katana 7w&type=Spot&beam_angle=15&color=White&chipset=Standard&ct=5000&page=1&limit=20
 */
export async function getCRI(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    let { product, type, beam_angle, color, chipset, ct } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    if (!product || !color || !chipset /* || !ct */) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, chipset, parameters are required',
      });
    }

    const query = { product, color, chipset, /* ct */ };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;

  requestLogger.debug({ query }, 'Fetching CRI values');
  const cris = await Product.distinct('cri', query).exec();
  requestLogger.debug({ count: cris.length }, 'CRI values fetched');
    // Sort numerically
    const sortedCris = cris
      .filter(Boolean)
      // .map(cri => {
      //   const num = parseInt(cri, 10);
      //   return isNaN(num) ? null : num;
      // })
      .filter(cri => cri !== null)
      // .sort((a, b) => a - b)
      .map(cri => cri.toString());
    
    // Apply pagination
    const total = sortedCris.length;
    const paginatedCris = sortedCris.slice(skip, skip + limit);
    
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

/**
 * Step 8: Get drivers for selected combination (with pagination)
 * GET /api/products/selection/drivers?product=Katana 7w&type=Spot&beam_angle=15&color=White&chipset=Standard&ct=5000&cri=80&page=1&limit=20
 */
export async function getDrivers(req, res, next) {
  try {
    const requestLogger = req.log || logger;
    let { product, type, beam_angle, color, chipset, ct, cri } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;
    
    if (!product || !color || !chipset || !ct || !cri) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'Product, color, chipset, ct, and cri parameters are required',
      });
    }

    const query = { product, color, chipset, ct, cri };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;
    requestLogger.debug({ query }, 'Fetching drivers');
    const drivers = await Product.find(
      query,
      { drive: 1, power_factor: 1, drive_details: 1, warranty: 1 }
    )
      .lean()
      .exec();

    // Get unique drivers with their details
    const uniqueDrivers = [];
    const driverMap = new Map();

    drivers.forEach((item) => {
      if (item.drive && !driverMap.has(item.drive)) {
        driverMap.set(item.drive, {
          drive: item.drive,
          power_factor: item.power_factor,
          drive_details: item.drive_details,
          warranty: item.warranty,
        });
        uniqueDrivers.push(driverMap.get(item.drive));
      }
    });

    // Apply pagination
    const total = uniqueDrivers.length;
    const paginatedDrivers = uniqueDrivers.slice(skip, skip + limit);

    requestLogger.debug({ total }, 'Drivers fetched');

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

/**
 * Step 9: Get final product with MRP
 * GET /api/products/selection/final?product=Katana 7w&type=Spot&beam_angle=15&color=White&chipset=Standard&ct=5000&cri=80&drive=Non-Dimmable
 */
export async function getFinalProduct(req, res, next) {
  try {
    let { product, type, beam_angle, color, chipset, ct, cri, drive } = req.query;
    
    if (!product || !color || !chipset || !ct || !cri || !drive) {
      return res.status(HTTPStatus.BAD_REQUEST).json({
        status: 0,
        message: 'All parameters are required: product, color, chipset, ct, cri, drive',
      });
    }

    const query = { product, color, chipset, ct, cri, drive };
    if (type) query.type = type;
    if (beam_angle) query.beam_angle = beam_angle;

    const finalProduct = await Product.findOne(query).lean().exec();

    if (!finalProduct) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        status: 0,
        message: 'Product not found with selected combination',
      });
    }

    // Add displayName
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
      id: finalProduct._id.toString(),
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