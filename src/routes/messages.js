const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { authenticate } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/conversations", authenticate, messageController.getConversations);
router.post("/conversations", authenticate, messageController.createConversation);
router.get("/conversations/:conversationId/messages", authenticate, messageController.getMessages);
router.post("/conversations/:conversationId/messages", authenticate, upload.single("file"), messageController.sendMessage);
router.post("/conversations/:conversationId/read", authenticate, messageController.markConversationRead);
router.delete("/conversations/:conversationId", authenticate, messageController.deleteConversation);
router.delete("/:messageId", authenticate, messageController.deleteMessage);

module.exports = router;
