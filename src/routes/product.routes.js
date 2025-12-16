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
  getFinalProduct
} from '../controllers/product.controller.js';
import { uploadExcel } from '../controllers/productUpload.controller.js';

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
router.get('/', authJwt, list);

// Upload route
router.post('/upload', authJwt, upload.single('file'), uploadExcel);

// Cascading selection routes (specific routes before parameterized routes)
router.get('/selection', authJwt, getProducts);
router.get('/selection/types', authJwt, getTypes);
router.get('/selection/beamangles', authJwt, getBeamAngles);
router.get('/selection/colors', authJwt, getColors);
router.get('/selection/chipsets', authJwt, getChipsets);
router.get('/selection/ct', authJwt, getColorTemperatures);
router.get('/selection/cri', authJwt, getCRI);
router.get('/selection/drivers', authJwt, getDrivers);
router.get('/selection/final', authJwt, getFinalProduct);

// Get by ID (must be last to avoid conflicts with /selection routes)
router.get('/:id', authJwt, getById);

export default router;