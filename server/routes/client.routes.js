const express = require("express");
const router = express.Router();
const clientController = require("../controllers/client.controller");
const clientItemController = require("../controllers/clientItem.controller");
const clientHistoryController = require("../controllers/clientHistory.controller");
const clientLedgerController = require("../controllers/clientLedger.controller");
const clientTransactionController = require("../controllers/clientTransaction.controller");

// Client CRUD
router.get("/", clientController.list);
router.post("/list", clientController.listPost);
router.get("/:id", clientController.getOne);
router.post("/", clientController.create);
router.put("/:id", clientController.update);
router.delete("/:id", clientController.remove);

// Client's items (nested under client ID)
router.get("/:id/items", clientItemController.list);
router.post("/:id/items/list", clientItemController.listPost);
router.get("/:id/items/:itemId", clientItemController.getOne);
router.post("/:id/items", clientItemController.create);
router.put("/:id/items/:itemId", clientItemController.update);
router.delete("/:id/items/:itemId", clientItemController.remove);

// Client-specific history
router.get("/:id/history", clientHistoryController.list);
router.get("/:id/history/day-wise", clientHistoryController.dayWiseSummary);
router.get("/:id/history/month-wise", clientHistoryController.monthWiseSummary);

// Client ledger (Khatabook style)
router.get("/:id/ledger", clientLedgerController.getLedger);

// Client transactions (payments / adjustments)
router.get("/:id/transactions", clientTransactionController.list);
router.post("/:id/transactions", clientTransactionController.create);
router.delete("/:id/transactions/:transactionId", clientTransactionController.remove);

module.exports = router;
