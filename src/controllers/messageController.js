const pool = require("../config/db");
const AppError = require("../utils/AppError");

const getConversations = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = false AND sender_id != $1) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.user_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [req.userId]
    );

    for (let conv of result.rows) {
      const participants = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url FROM conversation_participants cp JOIN users u ON cp.user_id = u.id WHERE cp.conversation_id = $1`,
        [conv.id]
      );
      conv.participants = participants.rows;
    }

    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const createConversation = async (req, res, next) => {
  try {
    const { participantIds, title, type, courseId } = req.body;
    const participantSet = [...new Set([...participantIds, req.userId])];

    if (participantSet.length === 2 && !type) {
      const existing = await pool.query(
        `SELECT c.id FROM conversations c WHERE c.type = 'direct' AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $2)
         AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2`,
        [req.userId, participantIds[0]]
      );
      if (existing.rows.length > 0) {
        return res.json({ success: true, data: existing.rows[0] });
      }
    }

    const convResult = await pool.query(
      `INSERT INTO conversations (title, type, course_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, type === "group" ? "group" : "direct", courseId || null, req.userId]
    );
    const conversation = convResult.rows[0];

    for (const userId of participantSet) {
      await pool.query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [conversation.id, userId]
      );
    }

    res.status(201).json({ success: true, data: conversation });
  } catch (error) { next(error); }
};

const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT m.*, u.first_name || ' ' || u.last_name as sender_name, u.avatar_url as sender_avatar
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    const unreadIds = result.rows.filter(m => !m.is_read && m.sender_id !== req.userId).map(m => m.id);
    if (unreadIds.length > 0) {
      await pool.query(
        "UPDATE messages SET is_read = true, read_at = NOW() WHERE id = ANY($1::uuid[])",
        [unreadIds]
      );
    }

    res.json({ success: true, data: result.rows.reverse() });
  } catch (error) { next(error); }
};

const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, message, messageType } = req.body;
    let fileUrl = null;
    if (req.file) fileUrl = `/uploads/general/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, message, file_url, message_type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conversationId, req.userId, message, fileUrl, messageType || "text"]
    );

    const msg = result.rows[0];
    msg.sender_name = `${req.user.first_name} ${req.user.last_name}`;
    msg.sender_avatar = req.user.avatar_url;

    await pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [conversationId]
    );

    res.status(201).json({ success: true, data: msg });
  } catch (error) { next(error); }
};

const markConversationRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    await pool.query(
      "UPDATE messages SET is_read = true, read_at = NOW() WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false",
      [conversationId, req.userId]
    );
    await pool.query(
      "UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, req.userId]
    );
    res.json({ success: true, message: "Marked as read" });
  } catch (error) { next(error); }
};

const deleteConversation = async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM conversations WHERE id = $1 AND created_by = $2 RETURNING id",
      [req.params.conversationId, req.userId]
    );
    if (result.rows.length === 0) throw new AppError("Conversation not found or not authorized", 404);
    res.json({ success: true, message: "Conversation deleted" });
  } catch (error) { next(error); }
};

const deleteMessage = async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM messages WHERE id = $1 AND sender_id = $2 RETURNING id",
      [req.params.messageId, req.userId]
    );
    if (result.rows.length === 0) throw new AppError("Message not found or not authorized", 404);
    res.json({ success: true, message: "Message deleted" });
  } catch (error) { next(error); }
};

module.exports = { getConversations, createConversation, getMessages, sendMessage, markConversationRead, deleteConversation, deleteMessage };
