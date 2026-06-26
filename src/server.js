const http = require("http");
const socketIo = require("socket.io");
const app = require("./app");
const env = require("./config/env");
const setupSocket = require("./sockets");

const server = http.createServer(app);

// WebSocket upgrade for JaaS proxy (/jaas/* -> 8x8.vc)
server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/jaas") && app.jaasProxy) {
    app.jaasProxy.upgrade(req, socket, head);
  }
});

const io = socketIo(server, {
  cors: {
    origin: env.CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setupSocket(io);

app.set("io", io);

const PORT = env.PORT;

server.listen(PORT, () => {
  console.log(`Live Class Code server running on port ${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

module.exports = { app, server, io };
