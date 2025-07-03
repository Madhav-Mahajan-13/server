import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload image to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @param {Object} options - Upload options (folder, public_id, transformation, etc.)
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export const uploadToCloudinary = async (fileBuffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'auto',
                folder: options.folder || 'uploads',
                public_id: options.public_id,
                transformation: options.transformation,
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                max_file_size: 5000000, // 5MB limit
                ...options
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        // Convert buffer to stream and pipe to cloudinary
        uploadStream.end(fileBuffer);
    });
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} - Cloudinary deletion result
 */
export const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) {
            throw new Error('Public ID is required for deletion');
        }
        
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        throw error;
    }
};

/**
 * Upload multiple images to Cloudinary
 * @param {Array<Buffer>} fileBuffers - Array of file buffers
 * @param {Object} options - Upload options
 * @returns {Promise<Array>} - Array of Cloudinary upload results
 */
export const uploadMultipleToCloudinary = async (fileBuffers, options = {}) => {
    try {
        const uploadPromises = fileBuffers.map((buffer, index) => 
            uploadToCloudinary(buffer, {
                ...options,
                public_id: options.public_id ? `${options.public_id}_${index}` : undefined
            })
        );
        
        const results = await Promise.all(uploadPromises);
        return results;
    } catch (error) {
        console.error('Multiple upload error:', error);
        throw error;
    }
};

/**
 * Generate optimized URL for an image
 * @param {string} publicId - The public ID of the image
 * @param {Object} transformations - Transformation options
 * @returns {string} - Optimized image URL
 */
export const getOptimizedUrl = (publicId, transformations = {}) => {
    return cloudinary.url(publicId, {
        secure: true,
        transformation: [
            {
                quality: 'auto',
                fetch_format: 'auto',
                ...transformations
            }
        ]
    });
};

/**
 * Validate file before upload
 * @param {Object} file - Multer file object
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
export const validateFile = (file, options = {}) => {
    const {
        allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxSize = 5 * 1024 * 1024 // 5MB default
    } = options;
    
    const errors = [];
    
    if (!file) {
        errors.push('No file provided');
        return { isValid: false, errors };
    }
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
        errors.push(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }
    
    if (file.size > maxSize) {
        errors.push(`File size exceeds limit of ${maxSize / (1024 * 1024)}MB`);
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

export default cloudinary;