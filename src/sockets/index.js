const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const env = require("../config/env");

const onlineUsers = new Map();

function setupSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const result = await pool.query(
        "SELECT id, first_name, last_name, email, role_id FROM users WHERE id = $1 AND is_active = true",
        [decoded.userId]
      );
      if (result.rows.length === 0) {
        return next(new Error("User not found"));
      }
      socket.user = result.rows[0];
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, { socketId: socket.id, user: socket.user, connectedAt: new Date() });

    socket.join(`user:${userId}`);
    io.emit("users:online", Array.from(onlineUsers.keys()));

    socket.on("join:conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("leave:conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("message:send", async (data) => {
      try {
        const { conversationId, message, fileUrl, messageType } = data;
        const result = await pool.query(
          `INSERT INTO messages (conversation_id, sender_id, message, file_url, message_type)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [conversationId, userId, message, fileUrl, messageType || "text"]
        );
        const newMessage = result.rows[0];
        newMessage.sender = socket.user;
        io.to(`conversation:${conversationId}`).emit("message:new", newMessage);
      } catch (error) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("message:read", async (data) => {
      try {
        const { conversationId, messageId } = data;
        await pool.query(
          "UPDATE messages SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE id = $1 AND conversation_id = $2",
          [messageId, conversationId]
        );
        io.to(`conversation:${conversationId}`).emit("message:read", { messageId, userId });
      } catch (error) {
        socket.emit("error", { message: "Failed to mark as read" });
      }
    });

    socket.on("typing:start", (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit("typing:start", { userId, conversationId });
    });

    socket.on("typing:stop", (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { userId, conversationId });
    });

    socket.on("notification:send", (data) => {
      const { targetUserId, notification } = data;
      io.to(`user:${targetUserId}`).emit("notification:new", notification);
    });

    socket.on("join:course", (courseId) => {
      socket.join(`course:${courseId}`);
    });

    socket.on("leave:course", (courseId) => {
      socket.leave(`course:${courseId}`);
    });

    socket.on("course:announcement", (data) => {
      const { courseId, announcement } = data;
      io.to(`course:${courseId}`).emit("course:announcement", announcement);
    });

    socket.on("meeting:join", (meetingId) => {
      socket.join(`meeting:${meetingId}`);
      io.to(`meeting:${meetingId}`).emit("meeting:user-joined", { userId: socket.user.id, user: socket.user });
    });

    socket.on("meeting:leave", (meetingId) => {
      socket.leave(`meeting:${meetingId}`);
      io.to(`meeting:${meetingId}`).emit("meeting:user-left", { userId: socket.user.id });
    });

    socket.on("payment:initiate", async (data) => {
      try {
        const { paymentId, amount, provider } = data;
        const result = await pool.query(
          "SELECT * FROM payments WHERE id = $1 AND user_id = $2",
          [paymentId, userId]
        );
        if (result.rows.length > 0) {
          io.to(`user:${userId}`).emit("payment:initiated", {
            id: paymentId,
            amount,
            provider,
            status: "processing",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        socket.emit("error", { message: "Failed to initiate payment" });
      }
    });

    socket.on("payment:poll", async (data) => {
      try {
        const { paymentId } = data;
        const result = await pool.query(
          "SELECT id, status, amount, provider, failure_reason FROM payments WHERE id = $1 AND user_id = $2",
          [paymentId, userId]
        );
        if (result.rows.length > 0) {
          socket.emit("payment:status", result.rows[0]);
        }
      } catch (error) {
        socket.emit("error", { message: "Failed to poll payment" });
      }
    });

    socket.on("join:dashboard", () => {
      const roleResult = pool.query("SELECT r.slug FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1", [userId]);
      roleResult.then((r) => {
        if (r.rows.length > 0) {
          const role = r.rows[0].slug;
          if (["super-admin", "admin", "teacher"].includes(role)) {
            socket.join(`dashboard:${role}`);
          }
        }
      }).catch(() => {});
    });

    socket.on("leave:dashboard", () => {
      ["dashboard:super-admin", "dashboard:admin", "dashboard:teacher"].forEach((room) => {
        socket.leave(room);
      });
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      io.emit("users:online", Array.from(onlineUsers.keys()));
    });
  });
}

module.exports = setupSocket;
