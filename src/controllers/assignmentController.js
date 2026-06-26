const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { calculateLetterGrade } = require("../utils/helpers");

const createAssignment = async (req, res, next) => {
  try {
    const { courseId, lessonId, title, description, instructions, fileTypes, totalPoints, passingPoints, dueDate, isRequired, maxAttempts } = req.body;
    const result = await pool.query(
      `INSERT INTO assignments (course_id, lesson_id, title, description, instructions, file_types, total_points, passing_points, due_date, is_required, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [courseId, lessonId || null, title, description, instructions, fileTypes, totalPoints || 100, passingPoints || 60, dueDate, isRequired !== false, maxAttempts || 1]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getAssignments = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    let query = `SELECT a.*, c.title as course_title FROM assignments a JOIN courses c ON a.course_id = c.id`;
    const params = [];
    if (courseId) { query += ` WHERE a.course_id = $1`; params.push(courseId); }
    query += ` ORDER BY a.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const getAssignmentById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, c.title as course_title, c.slug as course_slug FROM assignments a JOIN courses c ON a.course_id = c.id WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Assignment not found", 404);

    if (req.userRole === "student") {
      const submission = await pool.query(
        "SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2 ORDER BY attempt_number DESC LIMIT 1",
        [req.params.id, req.userId]
      );
      result.rows[0].submission = submission.rows[0] || null;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateAssignment = async (req, res, next) => {
  try {
    const { title, description, instructions, fileTypes, totalPoints, passingPoints, dueDate, isPublished, isRequired, maxAttempts } = req.body;
    const result = await pool.query(
      `UPDATE assignments SET title = COALESCE($1, title), description = COALESCE($2, description), instructions = COALESCE($3, instructions),
       file_types = COALESCE($4, file_types), total_points = COALESCE($5, total_points), passing_points = COALESCE($6, passing_points),
       due_date = COALESCE($7, due_date), is_published = COALESCE($8, is_published), is_required = COALESCE($9, is_required),
       max_attempts = COALESCE($10, max_attempts) WHERE id = $11 RETURNING *`,
      [title, description, instructions, fileTypes, totalPoints, passingPoints, dueDate, isPublished, isRequired, maxAttempts, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Assignment not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteAssignment = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM assignments WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Assignment not found", 404);
    res.json({ success: true, message: "Assignment deleted" });
  } catch (error) {
    next(error);
  }
};

const submitAssignment = async (req, res, next) => {
  try {
    const { assignmentId, submissionText } = req.body;
    const assignment = await pool.query("SELECT * FROM assignments WHERE id = $1", [assignmentId]);
    if (assignment.rows.length === 0) throw new AppError("Assignment not found", 404);

    const existingSubmissions = await pool.query(
      "SELECT COUNT(*) as count FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2",
      [assignmentId, req.userId]
    );
    if (parseInt(existingSubmissions.rows[0].count) >= assignment.rows[0].max_attempts) {
      throw new AppError("Maximum attempts reached", 400);
    }

    let fileUrl = null;
    if (req.file) fileUrl = `/uploads/assignments/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, file_url, submission_text, attempt_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [assignmentId, req.userId, fileUrl, submissionText, parseInt(existingSubmissions.rows[0].count) + 1]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getSubmissions = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email, u.avatar_url
       FROM assignment_submissions s JOIN users u ON s.student_id = u.id
       WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC`,
      [assignmentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const getSubmissionById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email, u.avatar_url,
              a.title as assignment_title
       FROM assignment_submissions s JOIN users u ON s.student_id = u.id
       JOIN assignments a ON s.assignment_id = a.id WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Submission not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateSubmission = async (req, res, next) => {
  try {
    const { submissionText, fileUrl } = req.body;
    const result = await pool.query(
      `UPDATE assignment_submissions SET submission_text = COALESCE($1, submission_text),
       file_url = COALESCE($2, file_url) WHERE id = $3 RETURNING *`,
      [submissionText, fileUrl, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Submission not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteSubmission = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM assignment_submissions WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Submission not found", 404);
    res.json({ success: true, message: "Submission deleted" });
  } catch (error) { next(error); }
};

const gradeSubmission = async (req, res, next) => {
  try {
    const { pointsEarned, feedback } = req.body;
    const result = await pool.query(
      `UPDATE assignment_submissions SET points_earned = $1, feedback = $2, graded_by = $3, graded_at = NOW(), status = 'graded'
       WHERE id = $4 RETURNING *`,
      [pointsEarned, feedback, req.userId, req.params.submissionId]
    );
    if (result.rows.length === 0) throw new AppError("Submission not found", 404);

    const submission = result.rows[0];
    const assignment = await pool.query("SELECT total_points FROM assignments WHERE id = $1", [submission.assignment_id]);
    const totalPoints = assignment.rows[0]?.total_points || 100;
    const percentage = (pointsEarned / totalPoints) * 100;
    const letterGrade = calculateLetterGrade(percentage);

    const enrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = (SELECT course_id FROM assignments WHERE id = $2)",
      [submission.student_id, submission.assignment_id]
    );

    if (enrollment.rows.length > 0) {
      await pool.query(
        `INSERT INTO grades (enrollment_id, assignment_id, score, total_points, percentage, letter_grade, graded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [enrollment.rows[0].id, submission.assignment_id, pointsEarned, totalPoints, percentage, letterGrade, req.userId]
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getSubmissions,
  getSubmissionById,
  updateSubmission,
  deleteSubmission,
  gradeSubmission,
};
