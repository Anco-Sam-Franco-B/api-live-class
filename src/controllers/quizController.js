const pool = require("../config/db");
const AppError = require("../utils/AppError");

const createQuiz = async (req, res, next) => {
  try {
    const { courseId, lessonId, title, description, instructions, timeLimitMinutes, passingScore, maxAttempts, shuffleQuestions, showResults } = req.body;
    const result = await pool.query(
      `INSERT INTO quizzes (course_id, lesson_id, title, description, instructions, time_limit_minutes, passing_score, max_attempts, shuffle_questions, show_results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [courseId, lessonId || null, title, description, instructions, timeLimitMinutes || 0, passingScore || 60, maxAttempts || 1, shuffleQuestions || false, showResults !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getQuizzes = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    let query = `SELECT q.*, c.title as course_title FROM quizzes q JOIN courses c ON q.course_id = c.id`;
    const params = [];
    if (courseId) { query += ` WHERE q.course_id = $1`; params.push(courseId); }
    query += ` ORDER BY q.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getQuizById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT q.*, c.title as course_title FROM quizzes q JOIN courses c ON q.course_id = c.id WHERE q.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Quiz not found", 404);

    const questions = await pool.query(
      `SELECT id, question_text, question_type, points, sort_order, options FROM questions WHERE quiz_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );

    if (req.userRole !== "student") {
      const questionsWithAnswers = await pool.query(
        `SELECT * FROM questions WHERE quiz_id = $1 ORDER BY sort_order`,
        [req.params.id]
      );
      result.rows[0].questions = questionsWithAnswers.rows;
    } else {
      result.rows[0].questions = questions.rows;
    }

    const attempts = await pool.query(
      "SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2 ORDER BY created_at DESC",
      [req.params.id, req.userId]
    );
    result.rows[0].attempts = attempts.rows;

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateQuiz = async (req, res, next) => {
  try {
    const { title, description, instructions, timeLimitMinutes, passingScore, maxAttempts, shuffleQuestions, showResults, isPublished } = req.body;
    const result = await pool.query(
      `UPDATE quizzes SET title = COALESCE($1, title), description = COALESCE($2, description), instructions = COALESCE($3, instructions),
       time_limit_minutes = COALESCE($4, time_limit_minutes), passing_score = COALESCE($5, passing_score),
       max_attempts = COALESCE($6, max_attempts), shuffle_questions = COALESCE($7, shuffle_questions),
       show_results = COALESCE($8, show_results), is_published = COALESCE($9, is_published) WHERE id = $10 RETURNING *`,
      [title, description, instructions, timeLimitMinutes, passingScore, maxAttempts, shuffleQuestions, showResults, isPublished, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Quiz not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteQuiz = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM quizzes WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Quiz not found", 404);
    res.json({ success: true, message: "Quiz deleted" });
  } catch (error) { next(error); }
};

const addQuestion = async (req, res, next) => {
  try {
    const { quizId, questionText, questionType, points, options, correctAnswer, explanation } = req.body;
    const maxSort = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM questions WHERE quiz_id = $1", [quizId]);
    const result = await pool.query(
      `INSERT INTO questions (quiz_id, question_text, question_type, points, options, correct_answer, explanation, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [quizId, questionText, questionType || "multiple_choice", points || 1, JSON.stringify(options || []), correctAnswer, explanation, maxSort.rows[0].next]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateQuestion = async (req, res, next) => {
  try {
    const { questionText, questionType, points, options, correctAnswer, explanation, sortOrder } = req.body;
    const result = await pool.query(
      `UPDATE questions SET question_text = COALESCE($1, question_text), question_type = COALESCE($2, question_type),
       points = COALESCE($3, points), options = COALESCE($4, options), correct_answer = COALESCE($5, correct_answer),
       explanation = COALESCE($6, explanation), sort_order = COALESCE($7, sort_order) WHERE id = $8 RETURNING *`,
      [questionText, questionType, points, options ? JSON.stringify(options) : null, correctAnswer, explanation, sortOrder, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Question not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM questions WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Question not found", 404);
    res.json({ success: true, message: "Question deleted" });
  } catch (error) { next(error); }
};

const startQuizAttempt = async (req, res, next) => {
  try {
    const { quizId } = req.body;
    const quiz = await pool.query("SELECT * FROM quizzes WHERE id = $1 AND is_published = true", [quizId]);
    if (quiz.rows.length === 0) throw new AppError("Quiz not found", 404);

    const attemptCount = await pool.query(
      "SELECT COUNT(*) as count FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2",
      [quizId, req.userId]
    );
    if (parseInt(attemptCount.rows[0].count) >= quiz.rows[0].max_attempts) {
      throw new AppError("Maximum attempts reached", 400);
    }

    const pendingAttempt = await pool.query(
      "SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2 AND status = 'in_progress'",
      [quizId, req.userId]
    );
    if (pendingAttempt.rows.length > 0) {
      return res.json({ success: true, data: pendingAttempt.rows[0], message: "Resuming pending attempt" });
    }

    const result = await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number) VALUES ($1, $2, $3) RETURNING *`,
      [quizId, req.userId, parseInt(attemptCount.rows[0].count) + 1]
    );

    const questions = await pool.query(
      "SELECT id, question_text, question_type, points, sort_order, options FROM questions WHERE quiz_id = $1 ORDER BY sort_order",
      [quizId]
    );
    result.rows[0].questions = questions.rows;

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const submitQuizAttempt = async (req, res, next) => {
  try {
    const { attemptId, answers, timeSpentSeconds } = req.body;
    const attempt = await pool.query(
      "SELECT * FROM quiz_attempts WHERE id = $1 AND student_id = $2 AND status = 'in_progress'",
      [attemptId, req.userId]
    );
    if (attempt.rows.length === 0) throw new AppError("Attempt not found or already completed", 404);

    const quiz = await pool.query("SELECT * FROM quizzes WHERE id = $1", [attempt.rows[0].quiz_id]);
    const questions = await pool.query("SELECT * FROM questions WHERE quiz_id = $1", [attempt.rows[0].quiz_id]);

    let totalPoints = 0;
    let earnedPoints = 0;
    let processedAnswers = [];

    for (const q of questions.rows) {
      totalPoints += q.points;
      const userAnswer = answers.find(a => a.questionId === q.id);
      const isCorrect = userAnswer && userAnswer.answer === q.correct_answer;
      if (isCorrect) earnedPoints += q.points;
      processedAnswers.push({
        questionId: q.id,
        questionText: q.question_text,
        userAnswer: userAnswer?.answer || null,
        correctAnswer: q.correct_answer,
        isCorrect: !!isCorrect,
        points: q.points,
        earned: isCorrect ? q.points : 0,
        explanation: q.explanation,
      });
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const isPassed = score >= quiz.rows[0].passing_score;

    await pool.query(
      `UPDATE quiz_attempts SET answers = $1, score = $2, total_points = $3, earned_points = $4, completed_at = NOW(), time_spent_seconds = $5, is_passed = $6, status = 'completed'
       WHERE id = $7`,
      [JSON.stringify(processedAnswers), score, totalPoints, earnedPoints, timeSpentSeconds || 0, isPassed, attemptId]
    );

    res.json({
      success: true,
      data: { attemptId, score, totalPoints, earnedPoints, isPassed, answers: processedAnswers },
    });
  } catch (error) { next(error); }
};

const getQuizResults = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT qa.*, q.title as quiz_title, q.passing_score FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.id = $1 AND qa.student_id = $2`,
      [req.params.attemptId, req.userId]
    );
    if (result.rows.length === 0) throw new AppError("Attempt not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getQuestions = async (req, res, next) => {
  try {
    const { quizId } = req.query;
    let query = `SELECT q.* FROM questions q WHERE 1=1`;
    const params = [];
    if (quizId) { query += ` AND q.quiz_id = $1`; params.push(quizId); }
    query += ` ORDER BY q.sort_order`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getQuestionById = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM questions WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Question not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getQuizAttempts = async (req, res, next) => {
  try {
    const { quizId, courseId } = req.query;
    let query = `SELECT qa.*, u.first_name || ' ' || u.last_name as student_name, u.email as student_email,
                        q.title as quiz_title FROM quiz_attempts qa
                 JOIN users u ON qa.student_id = u.id JOIN quizzes q ON qa.quiz_id = q.id WHERE 1=1`;
    const params = [];
    if (quizId) { query += ` AND qa.quiz_id = $1`; params.push(quizId); }
    if (courseId) { query += ` AND q.course_id = $2`; params.push(courseId); }
    query += ` ORDER BY qa.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

module.exports = {
  createQuiz, getQuizzes, getQuizById, updateQuiz, deleteQuiz,
  getQuestions, getQuestionById, addQuestion, updateQuestion, deleteQuestion,
  getQuizAttempts, startQuizAttempt, submitQuizAttempt, getQuizResults,
};
