const ROLES = {
  SUPER_ADMIN: { id: 1, slug: "super-admin" },
  ADMIN: { id: 2, slug: "admin" },
  TEACHER: { id: 3, slug: "teacher" },
  STUDENT: { id: 4, slug: "student" },
};

const COURSE_LEVELS = ["beginner", "intermediate", "advanced", "all-levels"];
const COURSE_STATUS = ["draft", "published", "archived"];
const ENROLLMENT_STATUS = ["active", "completed", "cancelled", "expired"];
const ASSIGNMENT_STATUS = ["submitted", "graded", "late", "resubmitted"];
const MEETING_STATUS = ["scheduled", "live", "ended", "cancelled"];
const PAYMENT_STATUS = ["pending", "processing", "completed", "failed", "refunded"];
const PAYMENT_METHODS = ["mtn_momo", "airtel_money", "card", "bank_transfer"];
const ATTENDANCE_STATUS = ["present", "absent", "late", "excused"];
const QUIZ_STATUS = ["in_progress", "completed"];
const NOTIFICATION_TYPES = [
  "course_enrollment",
  "assignment_created",
  "assignment_graded",
  "quiz_available",
  "quiz_graded",
  "meeting_reminder",
  "payment_received",
  "certificate_issued",
  "course_completed",
  "system_announcement",
];

const FILE_TYPES = {
  IMAGE: ["jpg", "jpeg", "png", "gif", "svg"],
  DOCUMENT: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"],
  VIDEO: ["mp4", "webm", "avi", "mov"],
  ARCHIVE: ["zip", "rar", "tar", "gz"],
};

module.exports = {
  ROLES,
  COURSE_LEVELS,
  COURSE_STATUS,
  ENROLLMENT_STATUS,
  ASSIGNMENT_STATUS,
  MEETING_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  ATTENDANCE_STATUS,
  QUIZ_STATUS,
  NOTIFICATION_TYPES,
  FILE_TYPES,
};
