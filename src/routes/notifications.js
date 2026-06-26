const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, notificationController.getNotifications);
router.put("/:id/read", authenticate, notificationController.markAsRead);
router.put("/read-all", authenticate, notificationController.markAllAsRead);
router.delete("/:id", authenticate, notificationController.deleteNotification);

module.exports = router;
