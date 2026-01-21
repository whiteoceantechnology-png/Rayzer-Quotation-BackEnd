import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Ensure upload directories exist
const UPLOAD_DIR = path.join(os.tmpdir(), 'rayzerlights-uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Default memory storage for small files
const memoryStorage = multer.memoryStorage();

// Disk storage for large files (Excel uploads)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Export a function to create multer instances with custom options if needed
export const createMulter = (options = {}) => {
  return multer({ storage: memoryStorage, ...options });
};

// Configure multer for Excel upload - USE DISK STORAGE to prevent OOM
export const uploadExcelFile = multer({
  storage: diskStorage,  // DISK storage, not memory!
  limits: { fileSize: 50 * 1024 * 1024 },  // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  },
});

// Configure multer for image upload
export const uploadImage = createMulter({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG and JPEG images are allowed.'));
    }
  },
});

// Export a default multer instance (memory storage)
export const multerInstance = multer({ storage: memoryStorage });
