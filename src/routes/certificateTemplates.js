const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/certificateTemplateController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, requirePermission("view-certificate-templates"), ctrl.getAll);
router.get("/:id", authenticate, requirePermission("view-certificate-templates"), ctrl.getById);
router.post("/", authenticate, requirePermission("create-certificate-templates"), ctrl.create);
router.put("/:id", authenticate, requirePermission("edit-certificate-templates"), ctrl.update);
router.delete("/:id", authenticate, requirePermission("delete-certificate-templates"), ctrl.remove);

module.exports = router;
