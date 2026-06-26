const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/dashboard", authenticate, reportController.getDashboardStats);
router.get("/student/:studentId?", authenticate, reportController.getStudentReport);
router.get("/teacher/:teacherId?", authenticate, reportController.getTeacherReport);
router.get("/revenue", authenticate, requirePermission("view-reports"), reportController.getRevenueReport);
router.get("/attendance", authenticate, requirePermission("view-reports"), reportController.getAttendanceReport);
router.get("/enrollments", authenticate, requirePermission("view-reports"), reportController.getEnrollmentReport);

module.exports = router;
