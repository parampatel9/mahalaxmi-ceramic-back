const express = require("express");
const router = express.Router();
const clientHistoryController = require("../controllers/clientHistory.controller");

// Client history is auto-created on customer create; only list, getOne, delete exposed
router.get("/", clientHistoryController.list);
router.get("/:id", clientHistoryController.getOne);
router.delete("/:id", clientHistoryController.remove);

module.exports = router;
