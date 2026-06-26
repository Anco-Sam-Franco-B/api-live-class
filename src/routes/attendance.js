const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.post("/", authenticate, requirePermission("take-attendance"), attendanceController.markAttendance);
router.get("/", authenticate, attendanceController.getAttendance);
router.get("/my", authenticate, attendanceController.getMyAttendance);
router.get("/:id", authenticate, attendanceController.getAttendanceById);
router.delete("/:id", authenticate, requirePermission("manage-attendance"), attendanceController.deleteAttendance);

module.exports = router;
