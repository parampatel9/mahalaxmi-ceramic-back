const User = require("../models/admin");

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

// @desc Login user
// @route POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && user.password === password) { // Simple password check for now
            res.json({
                _id: user.id,
                username: user.username,
                email: user.email,
                message: "response correct"
            });
        } else {
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};