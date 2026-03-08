const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/", customerController.list);
router.post("/list", customerController.listPost);
router.get("/next-bill-number", customerController.getNextBillNumber);
router.get("/check-mobile", requireAuth, customerController.checkMobile);
router.post("/:id/payment", customerController.addPayment);
router.get("/:id/payments", customerController.getPayments);
router.get("/:id", customerController.getOne);
router.post("/", customerController.create);
router.put("/:id", customerController.update);
router.delete("/:id", customerController.remove);

module.exports = router;
