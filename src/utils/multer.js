import multer from 'multer';

// Default memory storage, can be customized as needed
const memoryStorage = multer.memoryStorage();

// Export a function to create multer instances with custom options if needed
export const createMulter = (options = {}) => {
  return multer({ storage: memoryStorage, ...options });
};

// Configure multer for Excel upload
export const uploadExcelFile = createMulter({
  limits: { fileSize: 25 * 1024 * 1024 },
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
