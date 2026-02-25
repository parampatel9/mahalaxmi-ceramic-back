/**
 * MongoDB migration: create collections and indexes for MongoDB Compass.
 * Run: npm run migrate   (or: node scripts/migrate.js)
 * Requires: .env with MONGO_URI set.
 */
require("dotenv").config();
const connectDB = require("../config/db");

const Admin = require("../server/models/admin");
const Client = require("../server/models/client");
const ItemType = require("../server/models/itemType");
const ClientItem = require("../server/models/clientItem");
const Customer = require("../server/models/customer");
const ClientHistory = require("../server/models/clientHistory");

const models = [
  { name: "Admin (admins)", model: Admin },
  { name: "Client (clients)", model: Client },
  { name: "ItemType (itemtypes)", model: ItemType },
  { name: "ClientItem (clientitems)", model: ClientItem },
  { name: "Customer (customers)", model: Customer },
  { name: "ClientHistory (clienthistories)", model: ClientHistory },
];

async function run() {
  try {
    await connectDB();
    console.log("Creating collections and indexes...\n");

    for (const { name, model } of models) {
      await model.syncIndexes();
      console.log("  OK:", name);
    }

    console.log("\nMigration done. You can open MongoDB Compass and see these collections.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

run();
