const express = require("express");
const router = express.Router();
const itemTypeController = require("../controllers/itemType.controller");

router.get("/", itemTypeController.list);
router.post("/list", itemTypeController.listPost);
router.get("/:id", itemTypeController.getOne);
router.post("/", itemTypeController.create);
router.put("/:id", itemTypeController.update);
router.delete("/:id", itemTypeController.remove);

module.exports = router;
