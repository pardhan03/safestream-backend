import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { app, server } from "./SocketIO/server.js";
import express from "express";
import cors from "cors";
import databaseConnection from "./database/database.js";
import userRoute from "./routes/userRoute.js"
import videoRoute from "./routes/videoRoute.js"

dotenv.config({
    path: ".env"
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());

const corsOptions = {
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Database
databaseConnection();

// Routes
app.use("/api/user", userRoute);
app.use("/api/video", videoRoute);

const PORT = 5000;

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});