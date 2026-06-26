const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const pool = require("../config/db");
const AppError = require("../utils/AppError");

router.get("/", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Subscription not found", 404);
    if (req.userRole === "student" && result.rows[0].user_id !== req.userId) {
      throw new AppError("Not authorized", 403);
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { plan, amount, currency, startDate, endDate, autoRenew } = req.body;
    const result = await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, currency, start_date, end_date, auto_renew) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, plan, amount, currency || "UGX", startDate, endDate, autoRenew || false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put("/:id", authenticate, async (req, res, next) => {
  try {
    const { plan, amount, autoRenew, status } = req.body;
    const result = await pool.query(
      `UPDATE subscriptions SET plan = COALESCE($1, plan), amount = COALESCE($2, amount),
       auto_renew = COALESCE($3, auto_renew), status = COALESCE($4, status) WHERE id = $5 AND user_id = $6 RETURNING *`,
      [plan, amount, autoRenew, status, req.params.id, req.userId]
    );
    if (result.rows.length === 0) throw new AppError("Subscription not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete("/:id", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM subscriptions WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.userId]);
    if (result.rows.length === 0) throw new AppError("Subscription not found", 404);
    res.json({ success: true, message: "Subscription cancelled" });
  } catch (error) { next(error); }
});

module.exports = router;
