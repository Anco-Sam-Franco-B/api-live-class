const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", courseController.getModules);
router.get("/:id", courseController.getModuleById);
router.post("/", authenticate, requirePermission("create-modules"), courseController.createModule);
router.put("/:id", authenticate, requirePermission("edit-modules"), courseController.updateModule);
router.delete("/:id", authenticate, requirePermission("delete-modules"), courseController.deleteModule);
router.post("/reorder", authenticate, requirePermission("edit-modules"), courseController.reorderModules);

module.exports = router;
