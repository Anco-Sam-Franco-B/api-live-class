const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticate, requirePermission } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/settings", authenticate, requirePermission("view-settings"), adminController.getPlatformSettings);
router.put("/settings", authenticate, requirePermission("edit-settings"), adminController.updatePlatformSettings);
router.get("/audit-logs", authenticate, requirePermission("view-audit-logs"), adminController.getAuditLogs);
router.get("/roles", authenticate, requirePermission("view-roles"), adminController.getRoles);
router.get("/roles/:id", authenticate, requirePermission("view-roles"), adminController.getRoleById);
router.post("/roles", authenticate, requirePermission("create-roles"), adminController.createRole);
router.put("/roles/:id", authenticate, requirePermission("edit-roles"), adminController.updateRole);
router.delete("/roles/:id", authenticate, requirePermission("delete-roles"), adminController.deleteRole);
router.put("/roles/:id/permissions", authenticate, requirePermission("edit-roles"), adminController.updateRolePermissions);
router.get("/permissions", authenticate, requirePermission("view-roles"), adminController.getPermissions);
router.post("/permissions", authenticate, requirePermission("create-roles"), adminController.createPermission);
router.put("/permissions/:id", authenticate, requirePermission("edit-roles"), adminController.updatePermission);
router.delete("/permissions/:id", authenticate, requirePermission("delete-roles"), adminController.deletePermission);
router.post("/upload", authenticate, requirePermission("edit-settings"), upload.single("file"), adminController.uploadFile);

module.exports = router;
