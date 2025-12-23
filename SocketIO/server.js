import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://serene-kelicha-ff250b.netlify.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
});
app.set("io", io);

export const getReceiverSocketId = (receiverId) => {
  return users[receiverId];
};

const users = {};

io.on("connection", (socket) => {
  socket.on("join", (userId) => {
    const roomId = String(userId);
    socket.join(roomId);
    console.log("Joined room:", roomId);
  });
});

export { app, io, server };
