const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticate, authorize, requirePermission } = require("../middleware/auth");
const upload = require("../middleware/upload");
const validate = require("../middleware/validate");
const { body } = require("express-validator");

router.get("/profile", authenticate, userController.getProfile);
router.put("/profile", authenticate, userController.updateProfile);
router.put("/avatar", authenticate, upload.single("avatar"), userController.updateAvatar);
router.get("/teachers", userController.getTeacherProfiles);

router.get("/", authenticate, requirePermission("view-users"), userController.getUsers);
router.post("/", authenticate, requirePermission("create-users"), userController.createUser);
router.get("/:id", authenticate, userController.getUserById);
router.put("/:id", authenticate, requirePermission("edit-users"), userController.updateUser);
router.delete("/:id", authenticate, requirePermission("delete-users"), userController.deleteUser);
router.post("/:id/lock", authenticate, requirePermission("edit-users"), userController.lockUser);
router.post("/:id/unlock", authenticate, requirePermission("edit-users"), userController.unlockUser);

module.exports = router;
