import "dotenv/config";
import express from "express";
import passport from "passport";
import cors from "cors";
import jwt from "jsonwebtoken";
import session from "express-session";
import "./auth.js";

// Import routes
import UserRouter from "./routes/UserRoutes.js";
import productRouter from "./routes/productRoutes.js";

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware (development only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

app.get("/auth/google",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: "select_account" // This forces Google to show account selection
  })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
  (req, res) => {
    try {
      // Generate JWT token
      const token = jwt.sign(
        { 
          id: req.user.id,
          email: req.user.email,
          name: req.user.name 
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: "7d" }
      );
      
      // Prepare user data (exclude sensitive information)
      const userData = {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        profile_picture: req.user.profile_picture,
        contact_number: req.user.contact_number,
        hostel: req.user.hostel,
        bio: req.user.bio
      };
      
      const user = encodeURIComponent(JSON.stringify(userData));
      
      // Redirect to frontend with token and user data
      res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}&user=${user}`);
    } catch (error) {
      console.error("Error in Google callback:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
    }
  }
);

// Enhanced logout route
app.post("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Logout failed" 
      });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: "Session destruction failed" 
        });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ 
        success: true, 
        message: "Logged out successfully" 
      });
    });
  });
});

// API routes
app.use("/api/users", UserRouter);
app.use("/api", productRouter);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  
  // Handle specific error types
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access"
    });
  }
  
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: err.errors
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🚀 Server is running!                       ║
║   📍 URL: http://localhost:${PORT}             ║
║   🌍 Environment: ${process.env.NODE_ENV || 'development'}         ║
║   🔐 Auth: Google OAuth2                      ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // In production, you might want to send this to a logging service
});

export default app;