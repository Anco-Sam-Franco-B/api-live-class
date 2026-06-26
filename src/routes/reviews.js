const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate } = require("../middleware/auth");

router.get("/course/:courseId", courseController.getCourseReviews);
router.get("/:id", courseController.getReviewById);
router.post("/", authenticate, courseController.createReview);
router.put("/:id", authenticate, courseController.updateReview);
router.delete("/:id", authenticate, courseController.deleteReview);

module.exports = router;
