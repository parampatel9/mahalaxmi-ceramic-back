const express = require("express");
const router = express.Router();

const { signup, login } = require("../controllers/auth.controller");

// router.post("/login", (req, res) => {
//   res.json({ message: "Login route working" });
// });

// router.post("/register", (req, res) => {
//   res.json({ message: "Register route working" });
// });

router.post("/login", login);
router.post("/register", signup);

module.exports = router;