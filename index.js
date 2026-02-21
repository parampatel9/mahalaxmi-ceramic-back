require('dotenv').config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const routes = require("./server/routes");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS FIX
app.use(cors({
  origin: "http://localhost:3039",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Timezone"]
}));

app.options("*", cors());

// Middleware
app.use(express.json());

// Routes
app.use("/api", routes);

// Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: "Invalid JSON format" });
  }
  next(err);
});

app.get("/", (req, res) => {
  res.send("Node.js + MongoDB API is running!");
});

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

startServer();