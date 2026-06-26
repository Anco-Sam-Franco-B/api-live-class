const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, quizController.getQuizzes);
router.get("/:id", authenticate, quizController.getQuizById);
router.post("/", authenticate, requirePermission("create-quizzes"), quizController.createQuiz);
router.put("/:id", authenticate, requirePermission("edit-quizzes"), quizController.updateQuiz);
router.delete("/:id", authenticate, requirePermission("delete-quizzes"), quizController.deleteQuiz);

router.get("/questions", authenticate, requirePermission("manage-questions"), quizController.getQuestions);
router.get("/questions/:id", authenticate, quizController.getQuestionById);
router.post("/questions", authenticate, requirePermission("manage-questions"), quizController.addQuestion);
router.put("/questions/:id", authenticate, requirePermission("manage-questions"), quizController.updateQuestion);
router.delete("/questions/:id", authenticate, requirePermission("manage-questions"), quizController.deleteQuestion);

router.get("/attempts", authenticate, requirePermission("view-quizzes"), quizController.getQuizAttempts);
router.post("/start", authenticate, quizController.startQuizAttempt);
router.post("/submit", authenticate, quizController.submitQuizAttempt);
router.get("/results/:attemptId", authenticate, quizController.getQuizResults);

module.exports = router;
