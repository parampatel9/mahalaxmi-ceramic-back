const express = require("express");
const router = express.Router();
const clientItemController = require("../controllers/clientItem.controller");

// List all client items (e.g. for customer form – select itemNumber from client item list)
router.get("/", clientItemController.listAll);

module.exports = router;
