const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");

router.get("/", customerController.list);
router.post("/list", customerController.listPost);
router.get("/next-bill-number", customerController.getNextBillNumber);
router.get("/:id", customerController.getOne);
router.post("/", customerController.create);
router.put("/:id", customerController.update);
router.delete("/:id", customerController.remove);

module.exports = router;
