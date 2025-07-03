import pool from "../db.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinaryService.js";

// Get all products with pagination and filters (excluding reported products and products from reported users)
export const getAllProducts = async (req, res) => {
    try {
        // Extract query parameters for filtering and pagination
        const { 
            page = 1, 
            limit = 20, 
            category, 
            minPrice, 
            maxPrice, 
            condition, 
            search,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            excludeSold = false 
        } = req.query;

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Build dynamic query - exclude reported products and products from reported users
        let queryText = `
            SELECT 
                p.id, 
                p.title, 
                p.description, 
                p.price, 
                p.category,
                p.condition,
                p.image_url,
                p.location,
                p.user_id,
                p.is_sold,
                p.created_at,
                p.updated_at,
                u.id as seller_id,
                u.name as seller_name,
                u.email as seller_email,
                u.contact_number as seller_contact,
                u.hostel as seller_hostel,
                u.profile_picture as seller_picture
            FROM products p 
            JOIN users u ON p.user_id = u.id
            WHERE p.is_reported = FALSE 
                AND u.is_reported = FALSE
        `;

        const queryParams = [];
        let paramCount = 1;

        // Add filters
        if (excludeSold === 'true') {
            queryText += ` AND p.is_sold = false`;
        }

        if (category) {
            queryText += ` AND p.category = $${paramCount}`;
            queryParams.push(category);
            paramCount++;
        }

        if (minPrice) {
            queryText += ` AND p.price >= $${paramCount}`;
            queryParams.push(parseFloat(minPrice));
            paramCount++;
        }

        if (maxPrice) {
            queryText += ` AND p.price <= $${paramCount}`;
            queryParams.push(parseFloat(maxPrice));
            paramCount++;
        }

        if (condition) {
            queryText += ` AND p.condition = $${paramCount}`;
            queryParams.push(condition);
            paramCount++;
        }

        if (search) {
            queryText += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        // Validate and add sorting
        const allowedSortFields = ['created_at', 'price', 'title'];
        const allowedSortOrders = ['ASC', 'DESC'];
        
        const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const validSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
        
        queryText += ` ORDER BY p.${validSortBy} ${validSortOrder}`;

        // Add pagination
        queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute main query
        const products = await pool.query(queryText, queryParams);

        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM products p 
            JOIN users u ON p.user_id = u.id
            WHERE p.is_reported = FALSE 
                AND u.is_reported = FALSE
        `;
        
        const countParams = [];
        paramCount = 1;

        // Add same filters for count query
        if (excludeSold === 'true') {
            countQuery += ` AND p.is_sold = false`;
        }

        if (category) {
            countQuery += ` AND p.category = $${paramCount}`;
            countParams.push(category);
            paramCount++;
        }

        if (minPrice) {
            countQuery += ` AND p.price >= $${paramCount}`;
            countParams.push(parseFloat(minPrice));
            paramCount++;
        }

        if (maxPrice) {
            countQuery += ` AND p.price <= $${paramCount}`;
            countParams.push(parseFloat(maxPrice));
            paramCount++;
        }

        if (condition) {
            countQuery += ` AND p.condition = $${paramCount}`;
            countParams.push(condition);
            paramCount++;
        }

        if (search) {
            countQuery += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
            countParams.push(`%${search}%`);
            paramCount++;
        }

        const totalResult = await pool.query(countQuery, countParams);
        const total = parseInt(totalResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // Format response
        const formattedProducts = products.rows.map(product => ({
            id: product.id,
            title: product.title,
            description: product.description,
            price: product.price,
            category: product.category,
            condition: product.condition,
            imageUrl: product.image_url,
            location: product.location,
            isSold: product.is_sold,
            createdAt: product.created_at,
            updatedAt: product.updated_at,
            seller: {
                id: product.seller_id,
                name: product.seller_name,
                email: product.seller_email,
                contactNumber: product.seller_contact,
                hostel: product.seller_hostel,
                profilePicture: product.seller_picture
            }
        }));

        return res.status(200).json({
            success: true,
            data: {
                products: formattedProducts,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems: total,
                    itemsPerPage: parseInt(limit),
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (err) {
        console.error("Error in getAllProducts:", err);
        return res.status(500).json({ 
            success: false,
            message: "Failed to fetch products",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get single product by ID with seller details (exclude reported products)
export const getProductById = async (req, res) => {
    const { productId } = req.params;
    
    try {
        // Validate productId
        if (!productId || isNaN(productId)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid product ID" 
            });
        }

        const query = `
            SELECT 
                p.id, 
                p.title, 
                p.description, 
                p.price, 
                p.category,
                p.condition,
                p.image_url,
                p.location,
                p.user_id,
                p.is_sold,
                p.report_count,
                p.created_at,
                p.updated_at,
                u.id as seller_id,
                u.name as seller_name,
                u.email as seller_email,
                u.contact_number as seller_contact,
                u.hostel as seller_hostel,
                u.profile_picture as seller_picture,
                u.bio as seller_bio
            FROM products p 
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1 
                AND p.is_reported = FALSE 
                AND u.is_reported = FALSE
        `;

        const product = await pool.query(query, [productId]);
        
        if (product.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "Product not found or not available" 
            });
        }

        const productData = product.rows[0];

        // Get related products from same seller (excluding reported)
        const relatedQuery = `
            SELECT 
                id, 
                title, 
                price, 
                image_url, 
                is_sold 
            FROM products 
            WHERE user_id = $1 
                AND id != $2 
                AND is_sold = false 
                AND is_reported = false
            ORDER BY created_at DESC 
            LIMIT 4
        `;
        
        const relatedProducts = await pool.query(relatedQuery, [productData.user_id, productId]);

        // Format response
        const formattedProduct = {
            id: productData.id,
            title: productData.title,
            description: productData.description,
            price: productData.price,
            category: productData.category,
            condition: productData.condition,
            imageUrl: productData.image_url,
            location: productData.location,
            isSold: productData.is_sold,
            reportCount: productData.report_count,
            createdAt: productData.created_at,
            updatedAt: productData.updated_at,
            seller: {
                id: productData.seller_id,
                name: productData.seller_name,
                email: productData.seller_email,
                contactNumber: productData.seller_contact,
                hostel: productData.seller_hostel,
                profilePicture: productData.seller_picture,
                bio: productData.seller_bio
            },
            relatedProducts: relatedProducts.rows.map(p => ({
                id: p.id,
                title: p.title,
                price: p.price,
                imageUrl: p.image_url
            }))
        };

        return res.status(200).json({
            success: true,
            data: formattedProduct
        });

    } catch (err) {
        console.error("Error in getProductById:", err);
        return res.status(500).json({ 
            success: false,
            message: "Failed to fetch product",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get products by user (seller) - exclude reported products
export const getProductsByUser = async (req, res) => {
    const { userId } = req.params;
    const { includeSold = false } = req.query;
    
    try {
        // Check if user is reported
        const userCheck = await pool.query(
            "SELECT is_reported FROM users WHERE id = $1",
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (userCheck.rows[0].is_reported) {
            return res.status(403).json({
                success: false,
                message: "User account is not available"
            });
        }

        let query = `
            SELECT 
                p.id, 
                p.title, 
                p.description, 
                p.price, 
                p.category,
                p.condition,
                p.image_url,
                p.location,
                p.is_sold,
                p.report_count,
                p.created_at,
                p.updated_at
            FROM products p 
            WHERE p.user_id = $1 
                AND p.is_reported = FALSE
        `;

        const queryParams = [userId];

        if (includeSold === 'false') {
            query += ` AND p.is_sold = false`;
        }

        query += ` ORDER BY p.created_at DESC`;

        const products = await pool.query(query, queryParams);

        // Get user info
        const userQuery = await pool.query(
            "SELECT id, name, email, profile_picture, report_count FROM users WHERE id = $1",
            [userId]
        );

        return res.status(200).json({
            success: true,
            data: {
                seller: userQuery.rows[0],
                products: products.rows,
                totalProducts: products.rows.length
            }
        });

    } catch (err) {
        console.error("Error in getProductsByUser:", err);
        return res.status(500).json({ 
            success: false,
            message: "Failed to fetch user products",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get product categories (excluding reported products)
export const getCategories = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.category,
                COUNT(*) as count
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.is_sold = false
                AND p.is_reported = false
                AND u.is_reported = false
            GROUP BY p.category
            ORDER BY count DESC
        `;

        const categories = await pool.query(query);

        return res.status(200).json({
            success: true,
            data: categories.rows
        });

    } catch (err) {
        console.error("Error in getCategories:", err);
        return res.status(500).json({ 
            success: false,
            message: "Failed to fetch categories",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Report a product
export const reportProduct = async (req, res) => {
    const { productId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id; // From auth middleware

    try {
        // Validate productId
        if (!productId || isNaN(productId)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid product ID" 
            });
        }

        // Check if product exists and is not already reported
        const productCheck = await pool.query(
            "SELECT * FROM products WHERE id = $1 AND is_reported = FALSE",
            [productId]
        );

        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found or already reported"
            });
        }

        // Check if user owns the product (can't report own product)
        if (productCheck.rows[0].user_id === userId) {
            return res.status(400).json({
                success: false,
                message: "You cannot report your own product"
            });
        }

        // Insert report (will trigger automatic count updates via database trigger)
        try {
            await pool.query(
                "INSERT INTO reports (user_id, product_id, reason) VALUES ($1, $2, $3)",
                [userId, productId, reason || null]
            );

            return res.status(201).json({
                success: true,
                message: "Product reported successfully"
            });

        } catch (insertError) {
            // Handle duplicate report
            if (insertError.code === '23505') { // Unique constraint violation
                return res.status(409).json({
                    success: false,
                    message: "You have already reported this product"
                });
            }
            throw insertError;
        }

    } catch (err) {
        console.error("Error in reportProduct:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to report product",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get reports for a product (admin only)
export const getProductReports = async (req, res) => {
    const { productId } = req.params;
    
    try {
        const query = `
            SELECT 
                r.id,
                r.reason,
                r.created_at,
                u.id as reporter_id,
                u.name as reporter_name,
                u.email as reporter_email
            FROM reports r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = $1
            ORDER BY r.created_at DESC
        `;

        const reports = await pool.query(query, [productId]);

        return res.status(200).json({
            success: true,
            data: {
                productId: parseInt(productId),
                totalReports: reports.rows.length,
                reports: reports.rows
            }
        });

    } catch (err) {
        console.error("Error in getProductReports:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch product reports",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get all reported products (admin only)
export const getReportedProducts = async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT 
                p.id,
                p.title,
                p.description,
                p.price,
                p.category,
                p.image_url,
                p.report_count,
                p.created_at,
                u.id as seller_id,
                u.name as seller_name,
                u.email as seller_email
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.report_count > 0
            ORDER BY p.report_count DESC, p.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const products = await pool.query(query, [limit, offset]);

        // Get total count
        const countQuery = await pool.query(
            "SELECT COUNT(*) as total FROM products WHERE report_count > 0"
        );
        const total = parseInt(countQuery.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            data: {
                products: products.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            }
        });

    } catch (err) {
        console.error("Error in getReportedProducts:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch reported products",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Remove report from product (admin only)
export const removeProductReport = async (req, res) => {
    const { reportId } = req.params;

    try {
        const result = await pool.query(
            "DELETE FROM reports WHERE id = $1 RETURNING *",
            [reportId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Report not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Report removed successfully"
        });

    } catch (err) {
        console.error("Error in removeProductReport:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to remove report",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Create new product
export const createProduct = async (req, res) => {
    const { title, description, price, category, condition, location } = req.body;
    const userId = req.user.id; // From auth middleware

    try {
        // Check if user is reported
        const userCheck = await pool.query(
            "SELECT is_reported FROM users WHERE id = $1",
            [userId]
        );

        if (userCheck.rows.length === 0 || userCheck.rows[0].is_reported) {
            return res.status(403).json({
                success: false,
                message: "Account is restricted from creating products"
            });
        }

        // Validate required fields
        if (!title || !description || !price || !category || !condition) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields: title, description, price, category, and condition"
            });
        }

        // Validate price
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: "Price must be a positive number"
            });
        }

        // Handle image upload
        let imageUrl = null;
        if (req.file) {
            try {
                const uploadResult = await uploadToCloudinary(req.file.buffer, {
                    folder: 'products',
                    public_id: `product_${Date.now()}`,
                    transformation: [
                        { width: 800, height: 800, crop: 'limit' },
                        { quality: 'auto' }
                    ]
                });
                imageUrl = uploadResult.secure_url;
            } catch (uploadError) {
                console.error("Error uploading to Cloudinary:", uploadError);
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload product image"
                });
            }
        }

        // Insert product into database
        const insertQuery = `
            INSERT INTO products (
                title, 
                description, 
                price, 
                category, 
                condition, 
                image_url, 
                location, 
                user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *
        `;

        const values = [
            title,
            description,
            parsedPrice,
            category,
            condition,
            imageUrl,
            location || null,
            userId
        ];

        const result = await pool.query(insertQuery, values);
        const newProduct = result.rows[0];

        // Get seller info
        const userQuery = await pool.query(
            "SELECT id, name, email FROM users WHERE id = $1",
            [userId]
        );

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: {
                ...newProduct,
                seller: userQuery.rows[0]
            }
        });

    } catch (err) {
        console.error("Error in createProduct:", err);
        
        // Clean up uploaded image if database insert fails
        if (imageUrl) {
            try {
                const publicId = extractPublicIdFromUrl(imageUrl);
                await deleteFromCloudinary(publicId);
            } catch (deleteError) {
                console.error("Error deleting image after failed insert:", deleteError);
            }
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create product",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Update product
export const updateProduct = async (req, res) => {
    const { productId } = req.params;
    const { title, description, price, category, condition, location, is_sold } = req.body;
    const userId = req.user.id;

    try {
        // Check if product exists and belongs to user
        const productCheck = await pool.query(
            "SELECT * FROM products WHERE id = $1 AND user_id = $2 AND is_reported = FALSE",
            [productId, userId]
        );

        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found or you don't have permission to update it"
            });
        }

        const currentProduct = productCheck.rows[0];
        let imageUrl = currentProduct.image_url;

        // Handle image update
        if (req.file) {
            try {
                // Delete old image if exists
                if (currentProduct.image_url) {
                    const publicId = extractPublicIdFromUrl(currentProduct.image_url);
                    await deleteFromCloudinary(publicId);
                }

                // Upload new image
                const uploadResult = await uploadToCloudinary(req.file.buffer, {
                    folder: 'products',
                    public_id: `product_${productId}_${Date.now()}`,
                    transformation: [
                        { width: 800, height: 800, crop: 'limit' },
                        { quality: 'auto' }
                    ]
                });
                imageUrl = uploadResult.secure_url;
            } catch (uploadError) {
                console.error("Error updating product image:", uploadError);
                return res.status(500).json({
                    success: false,
                    message: "Failed to update product image"
                });
            }
        }

        // Build dynamic update query
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        if (title !== undefined) {
            updateFields.push(`title = $${paramCount}`);
            values.push(title);
            paramCount++;
        }

        if (description !== undefined) {
            updateFields.push(`description = $${paramCount}`);
            values.push(description);
            paramCount++;
        }

        if (price !== undefined) {
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Price must be a positive number"
                });
            }
            updateFields.push(`price = $${paramCount}`);
            values.push(parsedPrice);
            paramCount++;
        }

        if (category !== undefined) {
            updateFields.push(`category = $${paramCount}`);
            values.push(category);
            paramCount++;
        }

        if (condition !== undefined) {
            updateFields.push(`condition = $${paramCount}`);
            values.push(condition);
            paramCount++;
        }

        if (location !== undefined) {
            updateFields.push(`location = $${paramCount}`);
            values.push(location);
            paramCount++;
        }

        if (is_sold !== undefined) {
            updateFields.push(`is_sold = $${paramCount}`);
            values.push(is_sold);
            paramCount++;
        }

        if (imageUrl !== currentProduct.image_url) {
            updateFields.push(`image_url = $${paramCount}`);
            values.push(imageUrl);
            paramCount++;
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update"
            });
        }

        // Add productId and userId to values
        values.push(productId, userId);

        const updateQuery = `
            UPDATE products 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
            RETURNING *
        `;

        const result = await pool.query(updateQuery, values);

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Error in updateProduct:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to update product",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Delete product
export const deleteProduct = async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;

    try {
        // Check if product exists and belongs to user
        const productCheck = await pool.query(
            "SELECT * FROM products WHERE id = $1 AND user_id = $2",
            [productId, userId]
        );

        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found or you don't have permission to delete it"
            });
        }

        const product = productCheck.rows[0];

        // Delete image from Cloudinary if exists
        if (product.image_url) {
            try {
                const publicId = extractPublicIdFromUrl(product.image_url);
                await deleteFromCloudinary(publicId);
            } catch (deleteError) {
                console.error("Error deleting image from Cloudinary:", deleteError);
                // Continue with product deletion even if image deletion fails
            }
        }

        // Delete product from database (will cascade delete reports)
        await pool.query("DELETE FROM products WHERE id = $1", [productId]);

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });

    } catch (err) {
        console.error("Error in deleteProduct:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete product",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Mark product as sold
export const markProductAsSold = async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;

    try {
        const result = await pool.query(
            "UPDATE products SET is_sold = true WHERE id = $1 AND user_id = $2 AND is_reported = FALSE RETURNING *",
            [productId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found or you don't have permission to update it"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product marked as sold",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Error in markProductAsSold:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to mark product as sold",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Helper function to extract public_id from Cloudinary URL
function extractPublicIdFromUrl(url) {
    if (!url) return null;
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex !== -1 && uploadIndex < parts.length - 2) {
        const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/');
        return publicIdWithExtension.replace(/\.[^/.]+$/, '');
    }
    return null;
}