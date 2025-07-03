import multer from 'multer';
import { validateFile } from '../utils/cloudinaryService.js';

// Configure memory storage for Cloudinary upload
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
    const validation = validateFile(file);
    
    if (validation.isValid) {
        cb(null, true);
    } else {
        cb(new Error(validation.errors.join(', ')), false);
    }
};

// Create multer upload instances with different configurations
export const uploadSingle = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

export const uploadMultiple = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
        files: 10 // Maximum 10 files
    }
});

// Middleware for handling upload errors
export const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                message: 'File size too large. Maximum size is 5MB.' 
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                message: 'Too many files. Maximum is 10 files.' 
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ 
                message: 'Unexpected field name for file upload.' 
            });
        }
        return res.status(400).json({ 
            message: `Upload error: ${err.message}` 
        });
    } else if (err) {
        return res.status(400).json({ 
            message: err.message || 'File upload failed' 
        });
    }
    next();
};

// Specific middleware for profile picture upload
export const uploadProfilePicture = uploadSingle.single('profile_picture');

// Middleware for multiple image uploads (if needed in future)
export const uploadImages = uploadMultiple.array('images', 10);

// Middleware to validate and process uploaded files
export const processUploadedFile = async (req, res, next) => {
    try {
        if (!req.file && !req.files) {
            return next();
        }

        // For single file
        if (req.file) {
            const validation = validateFile(req.file);
            if (!validation.isValid) {
                return res.status(400).json({
                    message: 'File validation failed',
                    errors: validation.errors
                });
            }
        }

        // For multiple files
        if (req.files && Array.isArray(req.files)) {
            for (const file of req.files) {
                const validation = validateFile(file);
                if (!validation.isValid) {
                    return res.status(400).json({
                        message: 'File validation failed',
                        errors: validation.errors,
                        filename: file.originalname
                    });
                }
            }
        }

        next();
    } catch (error) {
        console.error('Error processing uploaded file:', error);
        return res.status(500).json({
            message: 'Error processing uploaded file'
        });
    }
};