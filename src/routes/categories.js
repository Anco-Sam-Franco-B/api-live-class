const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", courseController.getCategories);
router.post("/", authenticate, requirePermission("create-categories"), courseController.createCategory);
router.put("/:id", authenticate, requirePermission("edit-categories"), courseController.updateCategory);
router.get("/:id", courseController.getCategoryById);
router.delete("/:id", authenticate, requirePermission("delete-categories"), courseController.deleteCategory);

module.exports = router;
