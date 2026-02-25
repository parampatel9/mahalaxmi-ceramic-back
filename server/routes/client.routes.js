const express = require("express");
const router = express.Router();
const clientController = require("../controllers/client.controller");
const clientItemController = require("../controllers/clientItem.controller");

// Client CRUD
router.get("/", clientController.list);
router.get("/:id", clientController.getOne);
router.post("/", clientController.create);
router.put("/:id", clientController.update);
router.delete("/:id", clientController.remove);

// Client's items (nested under client ID)
router.get("/:id/items", clientItemController.list);
router.get("/:id/items/:itemId", clientItemController.getOne);
router.post("/:id/items", clientItemController.create);
router.put("/:id/items/:itemId", clientItemController.update);
router.delete("/:id/items/:itemId", clientItemController.remove);

module.exports = router;
