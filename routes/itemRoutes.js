const express = require("express");
const router = express.Router();
const { getItems, createItem } = require("../controllers/itemController");

router.get("/", getItems);
router.post("/", createItem);

module.exports = router;
