import { createUser, findUserByEmail, findUserById, updateUser, updateUserBalance } from "../services/user/userService.js";
import bcrypt from "bcrypt";
import generateToken from "../services/generateTokenService.js";

// Basic RFC-5322-inspired email regex for quick format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "name, email and password are required" });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ error: "Please provide a valid email address" });
        }

        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: "Email already in use" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await createUser(name, email, hashedPassword);
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "email and password are required" });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ error: "Please provide a valid email address" });
        }

        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.password) {
            return res.status(401).json({ error: "This account uses Google Sign-In. Please log in with Google." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid Password" });
        }
        const token = generateToken(user.user_id);

        res.json({ 
            success: true,
            message: "Login successful",
            token
         });

        
    } catch (error) {
        res.status(500).json({ error: error.message });
        
    }
}


const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: "No fields to update provided" });
        }

        const user = await updateUser(userId, { name });
        res.json({ success: true, message: "Profile updated", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateBalance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { money } = req.body;

        if (money === undefined || money === null) {
            return res.status(400).json({ error: "money field is required" });
        }

        const user = await updateUserBalance(userId, money);
        res.json({ success: true, message: "Balance updated", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export{
    registerUser,
    loginUser,
    getUserProfile,
    updateUserProfile,
    updateBalance
}