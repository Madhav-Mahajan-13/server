import jwt from "jsonwebtoken";
import pool from "../db.js";

// JWT Authentication Middleware
export const authenticateUser = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ") 
            ? authHeader.slice(7) 
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token provided. Please login to continue."
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get fresh user data from database
        const userQuery = await pool.query(
            "SELECT id, name, email, contact_number, hostel, bio, profile_picture FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User not found. Please login again."
            });
        }

        // Attach user to request object
        req.user = userQuery.rows[0];
        next();

    } catch (error) {
        console.error("Auth middleware error:", error);
        
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid token. Please login again."
            });
        }
        
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired. Please login again."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Authentication error"
        });
    }
};

// Optional: Middleware to check if user profile is complete
export const requireCompleteProfile = async (req, res, next) => {
    try {
        const user = req.user; // From authenticateUser middleware
        
        if (!user.contact_number || !user.hostel) {
            return res.status(403).json({
                success: false,
                message: "Please complete your profile before performing this action",
                profileComplete: false
            });
        }
        
        next();
    } catch (error) {
        console.error("Profile check error:", error);
        return res.status(500).json({
            success: false,
            message: "Error checking profile status"
        });
    }
};

// Optional: Middleware to attach user without requiring authentication
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ") 
            ? authHeader.slice(7) 
            : null;

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const userQuery = await pool.query(
            "SELECT id, name, email, contact_number, hostel, bio, profile_picture FROM users WHERE id = $1",
            [decoded.id]
        );

        req.user = userQuery.rows.length > 0 ? userQuery.rows[0] : null;
        next();

    } catch (error) {
        // If token is invalid, just continue without user
        req.user = null;
        next();
    }
};