const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const pool = require("../config/db");
const AppError = require("../utils/AppError");

router.get("/", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM invoices WHERE user_id = $1 ORDER BY issued_at DESC",
      [req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get("/all", authenticate, requirePermission("view-invoices"), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT i.*, u.first_name || ' ' || u.last_name as user_name FROM invoices i JOIN users u ON i.user_id = u.id ORDER BY i.issued_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT i.*, u.first_name || ' ' || u.last_name as user_name FROM invoices i JOIN users u ON i.user_id = u.id WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Invoice not found", 404);
    if (req.userRole === "student" && result.rows[0].user_id !== req.userId) {
      throw new AppError("Not authorized", 403);
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;
