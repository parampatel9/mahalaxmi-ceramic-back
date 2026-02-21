require('dotenv').config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const routes = require("./server/routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", routes);

app.get("/", (req, res) => {
  res.send("Node.js + MongoDB API is running!");
});

const startServer = async () => {
  // Connect to Database
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

startServer();