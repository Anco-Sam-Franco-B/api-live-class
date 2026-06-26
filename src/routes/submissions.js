const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/assignmentController");
const { authenticate, requirePermission } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post("/", authenticate, upload.single("file"), assignmentController.submitAssignment);
router.get("/assignment/:assignmentId", authenticate, requirePermission("view-submissions"), assignmentController.getSubmissions);
router.get("/:id", authenticate, assignmentController.getSubmissionById);
router.put("/:id", authenticate, assignmentController.updateSubmission);
router.put("/:submissionId/grade", authenticate, requirePermission("grade-assignments"), assignmentController.gradeSubmission);
router.delete("/:id", authenticate, requirePermission("delete-submissions"), assignmentController.deleteSubmission);

module.exports = router;
