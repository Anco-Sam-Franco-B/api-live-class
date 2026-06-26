const pool = require("../config/db");

const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );
    const unreadCount = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false",
      [req.userId]
    );
    const total = await pool.query(
      "SELECT COUNT(*) as total FROM notifications WHERE user_id = $1",
      [req.userId]
    );
    res.json({ success: true, data: result.rows, unread: parseInt(unreadCount.rows[0].count), total: parseInt(total.rows[0].total) });
  } catch (error) { next(error); }
};

const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2", [id, req.userId]);
    res.json({ success: true, message: "Marked as read" });
  } catch (error) { next(error); }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await pool.query("UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false", [req.userId]);
    res.json({ success: true, message: "All marked as read" });
  } catch (error) { next(error); }
};

const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, JSON.stringify(data)]
    );
  } catch (error) {
    console.error("Notification error:", error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM notifications WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) { next(error); }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, createNotification, deleteNotification };
