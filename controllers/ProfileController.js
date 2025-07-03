import transporter from "../mailingService.js";
import pool from "../db.js";
import dotenv from "dotenv";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinaryService.js";

dotenv.config();

export const completeProfile = async (req, res) => {
    const {email, contact_number , hostel} = req.body;
    // const userId = req.user.id;
    try{
        const check_for_user = await pool.query("select * from users where email = $1", [email]);
        if(check_for_user.rows.length === 0){
            return res.status(404).json({message: "User not found"});
        }
        const updateUser = await pool.query(
            "UPDATE users SET contact_number = $1, hostel = $2 WHERE email=$3 RETURNING *",
            [contact_number, hostel,email]
        );
        if(updateUser.rows.length === 0){
            return res.status(404).json({message: "Failed to update user, try again later"});
        }
        else{
            const user = updateUser.rows[0];
            const mailOptions = {
                from: process.env.sender_email,
                to: email,
                subject: "Profile Updated Successfully",
                text: `Hello ${check_for_user.name},\n\nYour profile has been updated successfully with data contact ->${contact_number} and hostel->${hostel}.\n\nThank you!`
            };
            await transporter.sendMail(mailOptions);
            return res.status(200).json({message: "Profile updated successfully", user});
        }
    }catch(err){
        console.error("Error in completeProfile:", err);
        return res.status(500).json({message: "Internal server error"});
    }
}

export const updateprofile = async (req, res) => {
    const {bio, name, contact_number, hostel} = req.body;
    const userId = req.user.id;
    
    try {
        // Check if user exists
        const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if(userQuery.rows.length === 0){
            return res.status(404).json({message: "User not found"});
        }
        
        const currentUser = userQuery.rows[0];
        let profilePictureUrl = currentUser.profile_picture;
        
        // Handle profile picture upload if file is provided
        if(req.file){
            try {
                // Delete old profile picture from Cloudinary if exists
                if(currentUser.profile_picture){
                    // Skip deletion if the profile picture is from Google
                    if (!currentUser.profile_picture.startsWith("https://lh3.googleusercontent.com/")) {
                        const publicId = extractPublicIdFromUrl(currentUser.profile_picture);
                        await deleteFromCloudinary(publicId);
                    }
                }
                
                // Upload new profile picture to Cloudinary
                const uploadResult = await uploadToCloudinary(req.file.buffer, {
                    folder: 'profile_pictures',
                    public_id: `user_${userId}_${Date.now()}`,
                    transformation: [
                        { width: 1200, height: 1200, crop: 'fill' },
                        { quality: 'auto' }
                    ]
                });
                
                profilePictureUrl = uploadResult.secure_url;
        } catch(uploadError) {
                console.error("Error uploading to Cloudinary:", uploadError);
                return res.status(500).json({message: "Failed to upload profile picture"});
        }
    }
        
        // Build dynamic update query based on provided fields
        const updateFields = [];
        const values = [];
        let paramCount = 1;
        
        if(bio !== undefined){
            updateFields.push(`bio = $${paramCount}`);
            values.push(bio);
            paramCount++;
        }
        
        if(name !== undefined){
            updateFields.push(`name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }
        
        if(contact_number !== undefined){
            updateFields.push(`contact_number = $${paramCount}`);
            values.push(contact_number);
            paramCount++;
        }
        
        if(hostel !== undefined){
            updateFields.push(`hostel = $${paramCount}`);
            values.push(hostel);
            paramCount++;
        }
        
        if(profilePictureUrl !== currentUser.profile_picture){
            updateFields.push(`profile_picture = $${paramCount}`);
            values.push(profilePictureUrl);
            paramCount++;
        }
        
        // Add userId at the end
        values.push(userId);
        
        if(updateFields.length === 0){
            return res.status(400).json({message: "No fields to update"});
        }
        
        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        const updateResult = await pool.query(updateQuery, values);
        
        if(updateResult.rows.length === 0){
            return res.status(404).json({message: "Failed to update profile"});
        }
        
        const updatedUser = updateResult.rows[0];
        
        // Send email notification
        const mailOptions = {
            from: process.env.sender_email,
            to: updatedUser.email,
            subject: "Profile Updated Successfully",
            html: `
                <h3>Hello ${updatedUser.name},</h3>
                <p>Your profile has been updated successfully with the following changes:</p>
                <ul>
                    ${name !== undefined ? `<li>Name: ${name}</li>` : ''}
                    ${bio !== undefined ? `<li>Bio: ${bio}</li>` : ''}
                    ${contact_number !== undefined ? `<li>Contact Number: ${contact_number}</li>` : ''}
                    ${hostel !== undefined ? `<li>Hostel: ${hostel}</li>` : ''}
                    ${req.file ? `<li>Profile Picture: Updated</li>` : ''}
                </ul>
                <p>Thank you!</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        // Remove sensitive data before sending response
        const { created_at, ...userResponse } = updatedUser;
        
        return res.status(200).json({
            message: "Profile updated successfully", 
            user: userResponse
        });
        
    } catch (error) {
        console.error("Error in updateprofile:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

export const getProfile = async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ message: "userId is required in params" });
    }

    try {
        const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if(userQuery.rows.length === 0){
            return res.status(404).json({message: "User not found"});
        }
        
        const user = userQuery.rows[0];
        // Remove sensitive data before sending response
        const { created_at, ...userResponse } = user;
        
        return res.status(200).json({user: userResponse});
    } catch (error) {
        console.error("Error in getProfile:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

export const getallProfiles = async (req, res) => {
        try {
            const usersQuery = await pool.query("SELECT id, name, email, profile_picture FROM users");
            const users = usersQuery.rows;
            
            if(users.length === 0){
                return res.status(404).json({message: "No users found"});
            }
            
            return res.status(200).json({users});
        } catch (error) {
            console.error("Error in getallProfiles:", error);
            return res.status(500).json({message: "Internal server error"});
        }
    }

export const deleteProfile = async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
    }
    try {
        // Check if user exists
        const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if(userQuery.rows.length === 0){
            return res.status(404).json({message: "User not found"});
        }
        
        const currentUser = userQuery.rows[0];
        
        // Delete profile picture from Cloudinary if it exists and is not from Google
        if(currentUser.profile_picture){
            if (!currentUser.profile_picture.startsWith("https://lh3.googleusercontent.com/")) {
                const publicId = extractPublicIdFromUrl(currentUser.profile_picture);
                await deleteFromCloudinary(publicId);
            }
        }
        
        // Delete user from database
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
        
        return res.status(200).json({message: "Profile deleted successfully"});
    } catch (error) {
        console.error("Error in deleteProfile:", error);
        return res.status(500).json({message: "Internal server error"});
    }

}


function extractPublicIdFromUrl(url) {
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/profile_pictures/user_1_1234567890.jpg
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex !== -1 && uploadIndex < parts.length - 2) {
        // Get everything after version number
        const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/');
        // Remove file extension
        return publicIdWithExtension.replace(/\.[^/.]+$/, '');
    }
    return null;
    }

