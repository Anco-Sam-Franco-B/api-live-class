const pool = require("../config/db");
const AppError = require("../utils/AppError");

const getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, courseId, priority } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT a.*, u.first_name || ' ' || u.last_name as author_name, u.avatar_url,
                 (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) as read_count,
                 CASE WHEN $5::uuid IS NOT NULL THEN EXISTS (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = $5) ELSE false END as is_read
                 FROM announcements a JOIN users u ON a.author_id = u.id WHERE 1=1`;
    const params = [req.userId || null];
    let p = 2;
    if (courseId) { query += ` AND a.course_id = $${p++}`; params.push(courseId); }
    if (priority) { query += ` AND a.priority = $${p++}`; params.push(priority); }
    query += ` ORDER BY a.published_at DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    const count = await pool.query("SELECT COUNT(*) as total FROM announcements");
    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (error) { next(error); }
};

const getById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as author_name, u.avatar_url,
       (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) as read_count
       FROM announcements a JOIN users u ON a.author_id = u.id WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Announcement not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try {
    const { courseId, title, content, priority, targetAudience, attachments } = req.body;
    const result = await pool.query(
      `INSERT INTO announcements (course_id, author_id, title, content, priority, target_audience, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [courseId || null, req.userId, title, content, priority || 'normal', targetAudience || 'all', JSON.stringify(attachments || [])]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const { title, content, priority, targetAudience, attachments, isPublished } = req.body;
    const result = await pool.query(
      `UPDATE announcements SET title = COALESCE($1, title), content = COALESCE($2, content), priority = COALESCE($3, priority),
       target_audience = COALESCE($4, target_audience), attachments = COALESCE($5, attachments), is_published = COALESCE($6, is_published)
       WHERE id = $7 RETURNING *`,
      [title, content, priority, targetAudience, attachments ? JSON.stringify(attachments) : null, isPublished, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Announcement not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM announcements WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Announcement not found", 404);
    res.json({ success: true, message: "Announcement deleted" });
  } catch (error) { next(error); }
};

const markRead = async (req, res, next) => {
  try {
    await pool.query(
      "INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.params.id, req.userId]
    );
    res.json({ success: true, message: "Marked as read" });
  } catch (error) { next(error); }
};

module.exports = { getAll, getById, create, update, remove, markRead };
