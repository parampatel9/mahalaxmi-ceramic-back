const User = require("../models/admin");
const jwt = require("jsonwebtoken");

// @desc Register a new user
// @route POST /api/auth/signup
exports.signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const user = await User.create({ username, email, password });
        res.status(201).json({
            _id: user.id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc Logout user
// @route POST /api/auth/logout
exports.logout = async (req, res) => {
    try {
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc Login user
// @route POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // console.log(`Login attempt for email: ${email}`);

        const user = await User.findOne({ email });

        if (!user) {
            // console.log(`Login failed: User not found for email: ${email}`);
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (user.password === password) { // Simple password check for now
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || "24h" }
            );

            res.json({
                token,
                message: "Login successful"
            });
        } else {
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        // console.error(`Login error: ${error.message}`);
        res.status(500).json({ message: error.message });
    }
};