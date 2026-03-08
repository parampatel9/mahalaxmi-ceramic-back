const express = require("express");
const router = express.Router();
const billsController = require("../controllers/bills.controller");

router.get("/by-date", billsController.byDate);
router.get("/print/:id", billsController.generateBillPDF);


module.exports = router;
