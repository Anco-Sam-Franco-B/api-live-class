const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate, requirePermission } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/:id", courseController.getLessonById);
router.post("/", authenticate, requirePermission("create-lessons"), courseController.createLesson);
router.put("/:id", authenticate, requirePermission("edit-lessons"), courseController.updateLesson);
router.delete("/:id", authenticate, requirePermission("delete-lessons"), courseController.deleteLesson);
router.post("/reorder", authenticate, requirePermission("edit-lessons"), courseController.reorderLessons);
router.post("/:id/video", authenticate, requirePermission("edit-lessons"), upload.single("video"), courseController.updateLessonVideo);
router.post("/:id/pdf", authenticate, requirePermission("edit-lessons"), upload.single("pdf"), courseController.updateLessonPdf);

module.exports = router;
