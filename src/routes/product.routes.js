import { Router } from 'express';
import { uploadExcelFile, uploadImage } from '../utils/multer.js';
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
  createProduct,
  updateProduct,
  deleteProduct,
  listAll
} from '../controllers/product.controller.js';
import { uploadExcel } from '../controllers/productUpload.controller.js';
import { checkRole } from '../middlewares/rbac.middleware.js';
import constants from '../config/constants.js';

const { ROLES } = constants;

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
 *     summary: Bulk Upload Products via Excel (SSE Streaming)
 *     description: |
 *       Upload an Excel file to bulk import products. Uses Server-Sent Events (SSE) 
 *       for real-time progress updates. Compatible with Cloudflare's 100s timeout.
 *       
 *       **Excel Format:**
 *       - Required column: `product`
 *       - Optional: `color`, `chipset`, `type`, `beam_angle`, `ct`, `cri`, `drive`, 
 *         `power_factor`, `drive_details`, `warranty`, `dlp`, `mrp`, `image`
 *       
 *       **SSE Events:**
 *       - `start`: Upload started
 *       - `progress`: Progress update with percentage
 *       - `complete`: Upload finished with summary
 *       - `error`: Error occurred
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel file (.xlsx)
 *     responses:
 *       200:
 *         description: SSE stream with upload progress
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/UploadProgress'
 *       400:
 *         description: File required or invalid format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 */
router.post('/upload', authJwt, checkRole([ROLES.ADMIN]), uploadExcelFile.single('file'), uploadExcel);

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *               color:
 *                 type: string
 *               chipset:
 *                 type: string
 *               ct:
 *                 type: string
 *               cri:
 *                 type: string
 *               drive:
 *                 type: string
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
 *                 type: number
 *               image:
 *                 type: string
 *                 format: binary
 *               mrp:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created
 */
router.post('/', authJwt, checkRole([ROLES.ADMIN]), uploadImage.single('imageFile'), createProduct);

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
 *         multipart/form-data:
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
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Product updated
 */
router.patch('/:id', authJwt, checkRole([ROLES.ADMIN]), uploadImage.single('imageFile'), updateProduct);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete product (Admin Only)
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
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete('/:id', authJwt, checkRole([ROLES.ADMIN]), deleteProduct);

export default router;