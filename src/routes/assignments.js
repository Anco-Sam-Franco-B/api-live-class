const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/assignmentController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, assignmentController.getAssignments);
router.get("/:id", authenticate, assignmentController.getAssignmentById);
router.post("/", authenticate, requirePermission("create-assignments"), assignmentController.createAssignment);
router.put("/:id", authenticate, requirePermission("edit-assignments"), assignmentController.updateAssignment);
router.delete("/:id", authenticate, requirePermission("delete-assignments"), assignmentController.deleteAssignment);

module.exports = router;
