const pool = require("../config/db");
const AppError = require("../utils/AppError");

const markAttendance = async (req, res, next) => {
  try {
    const { meetingId, studentId, status, notes } = req.body;
    const meeting = await pool.query("SELECT id, course_id FROM meetings WHERE id = $1", [meetingId]);
    if (meeting.rows.length === 0) throw new AppError("Meeting not found", 404);
    const enrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'",
      [studentId, meeting.rows[0].course_id]
    );
    if (enrollment.rows.length === 0) throw new AppError("Student not enrolled in this course", 400);
    const result = await pool.query(
      `INSERT INTO attendance (meeting_id, enrollment_id, student_id, status, check_in_time, marked_by)
       VALUES ($1, $2, $3, $4, NOW(), $5) ON CONFLICT (meeting_id, enrollment_id, student_id) DO UPDATE SET status = $4, check_in_time = NOW(), notes = $6 RETURNING *`,
      [meetingId, enrollment.rows[0].id, studentId, status || "present", req.userId, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getAttendance = async (req, res, next) => {
  try {
    const { meetingId, courseId, studentId } = req.query;
    let query = `SELECT a.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email, m.title as meeting_title FROM attendance a JOIN users u ON a.student_id = u.id JOIN meetings m ON a.meeting_id = m.id WHERE 1=1`;
    const params = [];
    let p = 1;
    if (meetingId) { query += ` AND a.meeting_id = $${p++}`; params.push(meetingId); }
    if (courseId) { query += ` AND m.course_id = $${p++}`; params.push(courseId); }
    if (studentId) { query += ` AND a.student_id = $${p++}`; params.push(studentId); }
    query += ` ORDER BY a.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getMyAttendance = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, m.title as meeting_title, m.scheduled_at, c.title as course_title
       FROM attendance a JOIN meetings m ON a.meeting_id = m.id JOIN courses c ON m.course_id = c.id
       WHERE a.student_id = $1 ORDER BY m.scheduled_at DESC`,
      [req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getAttendanceById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email,
              m.title as meeting_title, m.scheduled_at, c.title as course_title
       FROM attendance a JOIN users u ON a.student_id = u.id
       JOIN meetings m ON a.meeting_id = m.id JOIN courses c ON m.course_id = c.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Attendance record not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteAttendance = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM attendance WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Attendance record not found", 404);
    res.json({ success: true, message: "Attendance record deleted" });
  } catch (error) { next(error); }
};

module.exports = { markAttendance, getAttendance, getMyAttendance, getAttendanceById, deleteAttendance };
