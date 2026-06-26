const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate, authorize, requirePermission } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/", courseController.getCourses);
router.get("/my", authenticate, courseController.getMyCourses);
router.get("/teacher", authenticate, authorize("teacher"), courseController.getTeacherCourses);
router.get("/:slug/slug", courseController.getCourseBySlug);
router.get("/:id", courseController.getCourseById);
router.post("/", authenticate, requirePermission("create-courses"), courseController.createCourse);
router.put("/:id", authenticate, requirePermission("edit-courses"), courseController.updateCourse);
router.delete("/:id", authenticate, requirePermission("delete-courses"), courseController.deleteCourse);
router.post("/:id/publish", authenticate, requirePermission("publish-courses"), courseController.publishCourse);
router.post("/enroll", authenticate, courseController.enrollCourse);
router.get("/:courseId/students", authenticate, requirePermission("view-enrollments"), courseController.getCourseStudents);
router.get("/:courseId/lessons", courseController.getCourseLessons);
router.get("/:courseId/progress", authenticate, courseController.getCourseProgress);
router.post("/progress", authenticate, courseController.updateLessonProgress);

module.exports = router;
