const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/announcementController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, ctrl.getAll);
router.get("/:id", authenticate, ctrl.getById);
router.post("/", authenticate, requirePermission("create-announcements"), ctrl.create);
router.put("/:id", authenticate, requirePermission("edit-announcements"), ctrl.update);
router.delete("/:id", authenticate, requirePermission("delete-announcements"), ctrl.remove);
router.post("/:id/read", authenticate, ctrl.markRead);

module.exports = router;
