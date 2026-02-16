const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const itemRoutes = require("./routes/itemRoutes");

// Connect to Database
connectDB();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

app.get("/", (req, res) => {
  res.send("Node.js + MongoDB API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
