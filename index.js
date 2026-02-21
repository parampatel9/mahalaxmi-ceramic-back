require('dotenv').config();

const express = require("express");
const connectDB = require("./config/db");
const routes = require("./server/routes");

// Connect to Database
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api", routes);

app.get("/", (req, res) => {
  res.send("Node.js + MongoDB API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});