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

// CORS configuration - must be before other middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://serene-kelicha-ff250b.netlify.app"
  ],
  credentials: false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Apply CORS first
app.use(cors(corsOptions));

// Then other middleware
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());

// Database
databaseConnection();

// Routes
app.use("/api/user", userRoute);
app.use("/api/video", videoRoute);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("SafeStream backend is running!");
});
