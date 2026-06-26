const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const pool = require("../config/db");
const AppError = require("../utils/AppError");

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { lessonId, watchedDuration, isCompleted } = req.body;
    const enrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = (SELECT course_id FROM course_modules m JOIN lessons l ON l.module_id = m.id WHERE l.id = $2)",
      [req.userId, lessonId]
    );
    if (enrollment.rows.length === 0) return res.status(403).json({ success: false, message: "Not enrolled" });

    await pool.query(
      `INSERT INTO course_progress (enrollment_id, lesson_id, watched_duration, is_completed, completed_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() END)
       ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET watched_duration = $3, is_completed = $4, completed_at = CASE WHEN $4 THEN NOW() ELSE course_progress.completed_at END`,
      [enrollment.rows[0].id, lessonId, watchedDuration || 0, isCompleted || false]
    );
    res.json({ success: true, message: "Progress updated" });
  } catch (error) { next(error); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cp.*, l.title as lesson_title, l.content_type, l.duration_minutes
       FROM course_progress cp JOIN lessons l ON cp.lesson_id = l.id WHERE cp.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Progress not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put("/:id", authenticate, async (req, res, next) => {
  try {
    const { watchedDuration, isCompleted } = req.body;
    const result = await pool.query(
      `UPDATE course_progress SET watched_duration = COALESCE($1, watched_duration),
       is_completed = COALESCE($2, is_completed),
       completed_at = CASE WHEN $2 THEN NOW() ELSE completed_at END WHERE id = $3 RETURNING *`,
      [watchedDuration, isCompleted, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Progress not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete("/:id", authenticate, requirePermission("manage-progress"), async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM course_progress WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Progress not found", 404);
    res.json({ success: true, message: "Progress deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
