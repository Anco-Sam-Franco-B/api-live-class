const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const pool = require("../config/db");
const AppError = require("../utils/AppError");

router.get("/", authenticate, requirePermission("view-enrollments"), async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email, c.title as course_title
       FROM enrollments e JOIN users u ON e.user_id = u.id JOIN courses c ON e.course_id = c.id
       ORDER BY e.enrolled_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await pool.query("SELECT COUNT(*) as total FROM enrollments");
    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (error) { next(error); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email,
              c.title as course_title, c.slug as course_slug
       FROM enrollments e JOIN users u ON e.user_id = u.id JOIN courses c ON e.course_id = c.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Enrollment not found", 404);
    if (req.userRole === "student" && result.rows[0].user_id !== req.userId) {
      throw new AppError("Not authorized", 403);
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put("/:id", authenticate, requirePermission("edit-enrollments"), async (req, res, next) => {
  try {
    const { status, progress, completedLessons, totalLessons, isCompleted } = req.body;
    const result = await pool.query(
      `UPDATE enrollments SET status = COALESCE($1, status), progress = COALESCE($2, progress),
       completed_lessons = COALESCE($3, completed_lessons), total_lessons = COALESCE($4, total_lessons),
       is_completed = COALESCE($5, is_completed) WHERE id = $6 RETURNING *`,
      [status, progress, completedLessons, totalLessons, isCompleted, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Enrollment not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete("/:id", authenticate, requirePermission("delete-enrollments"), async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM enrollments WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Enrollment not found", 404);
    res.json({ success: true, message: "Enrollment deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
