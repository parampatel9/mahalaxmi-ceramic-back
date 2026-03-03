const express = require("express");
const router = express.Router();
const authRoutes = require("./auth.routes");
const clientRoutes = require("./client.routes");
const itemTypeRoutes = require("./itemType.routes");
const customerRoutes = require("./customer.routes");
const clientHistoryRoutes = require("./clientHistory.routes");
const clientItemRoutes = require("./clientItem.routes");
const billsRoutes = require("./bills.routes");

router.use("/auth", authRoutes);
router.use("/clients", clientRoutes);
router.use("/item-types", itemTypeRoutes);
router.use("/customers", customerRoutes);
router.use("/client-history", clientHistoryRoutes);
router.use("/client-items", clientItemRoutes);
router.use("/bills", billsRoutes);

module.exports = router;
