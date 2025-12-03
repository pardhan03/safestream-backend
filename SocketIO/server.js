import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins
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
