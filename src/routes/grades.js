const express = require("express");
const router = express.Router();
const gradeController = require("../controllers/gradeController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, gradeController.getGrades);
router.get("/student/:studentId?", authenticate, gradeController.getStudentGrades);
router.get("/:id", authenticate, gradeController.getGradeById);
router.post("/", authenticate, requirePermission("create-grades"), gradeController.createGrade);
router.put("/:id", authenticate, requirePermission("edit-grades"), gradeController.updateGrade);
router.delete("/:id", authenticate, requirePermission("delete-grades"), gradeController.deleteGrade);

module.exports = router;
