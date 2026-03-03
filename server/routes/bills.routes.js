const express = require("express");
const router = express.Router();
const billsController = require("../controllers/bills.controller");

router.get("/by-date", billsController.byDate);

module.exports = router;
