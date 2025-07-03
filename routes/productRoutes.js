import express from 'express';
import { 
    getAllProducts, 
    getProductById, 
    getProductsByUser,
    getCategories,
    createProduct,
    updateProduct,
    deleteProduct,
    markProductAsSold,
    reportProduct,
} from '../controllers/ProductController.js';
import { 
    authenticateUser, 
    requireCompleteProfile,
    optionalAuth 
} from '../middleware/authMiddleware.js';
import { 
    uploadSingle, 
    handleUploadError, 
    processUploadedFile 
} from '../middleware/uploadMiddleware.js';

const productRouter = express.Router();

// Public routes (no authentication required)
productRouter.get('/products',authenticateUser, getAllProducts); // Optional auth to show user's own products differently
productRouter.get('/products/:productId', optionalAuth, getProductById);
productRouter.get('/products/user/:userId', getProductsByUser);
productRouter.get('/categories', getCategories);

// Protected routes (authentication required)
// Create product - requires complete profile
productRouter.post(
    '/products',
    authenticateUser,
    requireCompleteProfile, // Ensure user has complete profile before selling
    uploadSingle.single('image'),
    processUploadedFile,
    createProduct
);

// Update product - only owner can update
productRouter.put(
    '/products/:productId',
    authenticateUser,
    uploadSingle.single('image'),
    processUploadedFile,
    updateProduct
);

// Delete product - only owner can delete
productRouter.delete(
    '/products/:productId',
    authenticateUser,
    deleteProduct
);

// Mark product as sold - only owner can mark as sold
productRouter.patch(
    '/products/:productId/sold',
    authenticateUser,
    markProductAsSold
);

// Get current user's products
productRouter.get(
    '/my-products',
    authenticateUser,
    async (req, res) => {
        req.params.userId = req.user.id;
        return getProductsByUser(req, res);
    }
);

productRouter.post('/:productId/report', authenticateUser, reportProduct);                  // POST /api/products/:productId/report


// Error handling middleware specific to product routes
productRouter.use(handleUploadError);

export default productRouter;