const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");

router.get("/public", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT key, value FROM system_settings");
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
});

module.exports = router;
