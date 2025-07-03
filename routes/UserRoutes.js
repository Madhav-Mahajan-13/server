import express from 'express';
import { 
    completeProfile, 
    deleteProfile, 
    getallProfiles, 
    getProfile, 
    updateprofile 
} from "../controllers/ProfileController.js";
import { 
    authenticateUser, 
    requireCompleteProfile 
} from '../middleware/authMiddleware.js';
import { 
    uploadProfilePicture, 
    handleUploadError, 
    processUploadedFile 
} from '../middleware/uploadMiddleware.js';

const UserRouter = express.Router();

// Complete profile (requires authentication)
UserRouter.post(
    "/complete-profile",
    authenticateUser,
    completeProfile
);

// Update profile (must be logged in and already completed profile)
UserRouter.put(
    "/update-profile",
    authenticateUser,
    requireCompleteProfile,
    uploadProfilePicture,
    processUploadedFile,
    updateprofile
);

// Get one profile (public or optionally restricted — depending on use case)
UserRouter.get(
    "/get-profile/:userId",
    authenticateUser, // Optional: you can remove this if you want it to be public
    getProfile
);

// Get all users (only for admin/moderators — adjust if needed)
UserRouter.get(
    "/get-all-users",
    authenticateUser, // Optional: secure access
    getallProfiles
);

UserRouter.delete("/delete-profile",
    authenticateUser,deleteProfile
);

// Handle upload errors at the end
UserRouter.use(handleUploadError);

export default UserRouter;
