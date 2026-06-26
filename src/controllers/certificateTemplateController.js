const pool = require("../config/db");
const AppError = require("../utils/AppError");

const getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, active } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT ct.*, u.first_name || ' ' || u.last_name as creator_name FROM certificate_templates ct LEFT JOIN users u ON ct.created_by = u.id WHERE 1=1`;
    const params = [];
    let p = 1;
    if (active === 'true') { query += ` AND ct.is_active = true`; }
    query += ` ORDER BY ct.created_at DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    const count = await pool.query("SELECT COUNT(*) as total FROM certificate_templates");
    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (error) { next(error); }
};

const getById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ct.*, u.first_name || ' ' || u.last_name as creator_name FROM certificate_templates ct LEFT JOIN users u ON ct.created_by = u.id WHERE ct.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Template not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try {
    const { name, description, backgroundUrl, logoUrl, layout, fontFamily, fontColor, accentColor, showStudentName, showCourseName, showDate, showGrade, showDuration, customText } = req.body;
    const result = await pool.query(
      `INSERT INTO certificate_templates (name, description, background_url, logo_url, layout, font_family, font_color, accent_color, show_student_name, show_course_name, show_date, show_grade, show_duration, custom_text, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [name, description, backgroundUrl || null, logoUrl || null, layout || '{}', fontFamily || 'Arial', fontColor || '#1a1a2e', accentColor || '#4f46e5', showStudentName !== false, showCourseName !== false, showDate !== false, showGrade !== false, showDuration !== false, customText || null, req.userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const { name, description, backgroundUrl, logoUrl, layout, fontFamily, fontColor, accentColor, showStudentName, showCourseName, showDate, showGrade, showDuration, customText, isActive } = req.body;
    const result = await pool.query(
      `UPDATE certificate_templates SET name = COALESCE($1, name), description = COALESCE($2, description), background_url = COALESCE($3, background_url), logo_url = COALESCE($4, logo_url), layout = COALESCE($5, layout), font_family = COALESCE($6, font_family), font_color = COALESCE($7, font_color), accent_color = COALESCE($8, accent_color), show_student_name = COALESCE($9, show_student_name), show_course_name = COALESCE($10, show_course_name), show_date = COALESCE($11, show_date), show_grade = COALESCE($12, show_grade), show_duration = COALESCE($13, show_duration), custom_text = COALESCE($14, custom_text), is_active = COALESCE($15, is_active) WHERE id = $16 RETURNING *`,
      [name, description, backgroundUrl, logoUrl, layout, fontFamily, fontColor, accentColor, showStudentName, showCourseName, showDate, showGrade, showDuration, customText, isActive, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Template not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM certificate_templates WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Template not found", 404);
    res.json({ success: true, message: "Template deleted" });
  } catch (error) { next(error); }
};

module.exports = { getAll, getById, create, update, remove };
