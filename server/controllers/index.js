const Item = require("../models/admin");

// @desc Get all items
// @route GET /api/items
exports.getItems = async (req, res) => {
    try {
        const items = await Item.find();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc Create a new item
// @route POST /api/items
exports.createItem = async (req, res) => {
    try {
        const { name, description, price } = req.body;
        const newItem = await Item.create({ name, description, price });
        res.status(201).json(newItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};