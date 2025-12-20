import { Router } from 'express';
import multer from 'multer';
import { authJwt } from '../services/auth.js';
import {
  list,
  getById,
  getProducts,
  getTypes,
  getBeamAngles,
  getColors,
  getChipsets,
  getColorTemperatures,
  getCRI,
  getDrivers,
  getFinalProduct,
  getById,
  createProduct,
  updateProduct,
  listAll
} from '../controllers/product.controller.js';
import { uploadExcel } from '../controllers/productUpload.controller.js';
import { checkRole } from '../middlewares/rbac.middleware.js';
import constants from '../config/constants.js';

const { ROLES } = constants;

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ];

    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

const router = new Router();

// List and search with pagination (must be before selection routes)
/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product Management
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: product
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/', authJwt, list);

/**
 * @swagger
 * /products/all:
 *   get:
 *     summary: List all products (Admin Only - No Pagination)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all products
 */
router.get('/all', authJwt, checkRole([ROLES.ADMIN]), listAll);

// Upload route
/**
 * @swagger
 * /products/upload:
 *   post:
 *     summary: Upload Product Excel
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Products uploaded
 */
router.post('/upload', authJwt, checkRole([ROLES.ADMIN]), upload.single('file'), uploadExcel);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create Product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *               color:
 *                 type: string
 *               chipset:
 *                 type: string
 *               mrp:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created
 */
router.post('/', authJwt, checkRole([ROLES.ADMIN]), createProduct);

// Cascading selection routes (specific routes before parameterized routes)
/**
 * @swagger
 * /products/selection:
 *   get:
 *     summary: Get unique products (Step 1)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unique product names
 */
router.get('/selection', authJwt, getProducts);

/**
 * @swagger
 * /products/selection/types:
 *   get:
 *     summary: Get types (Step 2)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: product
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Types
 */
router.get('/selection/types', authJwt, getTypes);
router.get('/selection/beamangles', authJwt, getBeamAngles);
router.get('/selection/colors', authJwt, getColors);
router.get('/selection/chipsets', authJwt, getChipsets);
router.get('/selection/ct', authJwt, getColorTemperatures);
router.get('/selection/cri', authJwt, getCRI);
router.get('/selection/drivers', authJwt, getDrivers);

/**
 * @swagger
 * /products/selection/final:
 *   get:
 *     summary: Get final product based on selection
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: color
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: chipset
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: ct
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cri
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: drive
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: beam_angle
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Final product details
 */
router.get('/selection/final', authJwt, getFinalProduct);

// Get by ID (must be last to avoid conflicts with /selection routes)
/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 */
router.get('/:id', authJwt, getById);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update product (Admin Only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *               color:
 *                 type: string
 *               chipset:
 *                 type: string
 *               mrp:
 *                 type: number
 *               type:
 *                 type: string
 *               beam_angle:
 *                 type: string
 *               power_factor:
 *                 type: string
 *               drive_details:
 *                 type: string
 *               warranty:
 *                 type: string
 *               dlp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product updated
 */
router.patch('/:id', authJwt, checkRole([ROLES.ADMIN]), updateProduct);

export default router;