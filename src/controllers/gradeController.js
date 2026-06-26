const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { calculateLetterGrade } = require("../utils/helpers");

const getGrades = async (req, res, next) => {
  try {
    const { courseId, studentId } = req.query;
    let query = `SELECT g.*, a.title as assignment_title, q.title as quiz_title, c.title as course_title
                 FROM grades g
                 LEFT JOIN assignments a ON g.assignment_id = a.id
                 LEFT JOIN quizzes q ON g.quiz_id = q.id
                 JOIN enrollments e ON g.enrollment_id = e.id
                 JOIN courses c ON e.course_id = c.id
                 WHERE 1=1`;
    const params = [];
    let p = 1;
    if (courseId) { query += ` AND c.id = $${p++}`; params.push(courseId); }
    if (studentId) { query += ` AND e.user_id = $${p++}`; params.push(studentId); }
    else if (req.userRole === "student") { query += ` AND e.user_id = $${p++}`; params.push(req.userId); }
    query += ` ORDER BY g.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getStudentGrades = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT g.*, a.title as assignment_title, q.title as quiz_title,
              c.title as course_title, c.slug as course_slug
       FROM grades g
       LEFT JOIN assignments a ON g.assignment_id = a.id
       LEFT JOIN quizzes q ON g.quiz_id = q.id
       JOIN enrollments e ON g.enrollment_id = e.id
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.params.studentId || req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const createGrade = async (req, res, next) => {
  try {
    const { enrollmentId, assignmentId, quizId, score, totalPoints, remarks } = req.body;
    const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const letterGrade = calculateLetterGrade(percentage);
    const result = await pool.query(
      `INSERT INTO grades (enrollment_id, assignment_id, quiz_id, score, total_points, percentage, letter_grade, remarks, graded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [enrollmentId, assignmentId || null, quizId || null, score, totalPoints, percentage, letterGrade, remarks, req.userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getGradeById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT g.*, a.title as assignment_title, q.title as quiz_title, c.title as course_title
       FROM grades g LEFT JOIN assignments a ON g.assignment_id = a.id
       LEFT JOIN quizzes q ON g.quiz_id = q.id
       JOIN enrollments e ON g.enrollment_id = e.id
       JOIN courses c ON e.course_id = c.id WHERE g.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Grade not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateGrade = async (req, res, next) => {
  try {
    const { score, totalPoints, remarks } = req.body;
    const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const letterGrade = calculateLetterGrade(percentage);
    const result = await pool.query(
      `UPDATE grades SET score = COALESCE($1, score), total_points = COALESCE($2, total_points),
       percentage = COALESCE($3, percentage), letter_grade = COALESCE($4, letter_grade),
       remarks = COALESCE($5, remarks) WHERE id = $6 RETURNING *`,
      [score, totalPoints, percentage, letterGrade, remarks, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Grade not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteGrade = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM grades WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Grade not found", 404);
    res.json({ success: true, message: "Grade deleted" });
  } catch (error) { next(error); }
};

module.exports = { getGrades, getStudentGrades, getGradeById, createGrade, updateGrade, deleteGrade };
