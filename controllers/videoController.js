import { Video } from "../models/video.model.js";

import fs from "fs";
import path from "path";
import mime from "mime-types";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads", "videos");

// Simulated processing: update progress, set sensitivity result, emit socket events
const simulateProcessing = async (videoDoc, io) => {
  try {
    videoDoc.status = "processing";
    videoDoc.progress = 0;
    await videoDoc.save();

    let progress = 0;
    const interval = setInterval(async () => {
      progress += Math.floor(Math.random() * 15) + 5; // bump
      if (progress >= 100) progress = 100;

      videoDoc.progress = progress;
      await videoDoc.save();

      if (io) io.to(String(videoDoc.user)).emit("video:progress", {
        videoId: videoDoc._id,
        progress,
        status: videoDoc.status
      });

      if (progress === 100) {
        clearInterval(interval);

        const flagged = Math.random() < 0.12; // 12% flagged
        videoDoc.sensitivity = flagged ? "flagged" : "safe";
        videoDoc.status = flagged ? "failed" : "completed";
        videoDoc.progress = 100;
        await videoDoc.save();

        if (io) io.to(String(videoDoc.user)).emit("video:completed", {
          videoId: videoDoc._id,
          status: videoDoc.status,
          sensitivity: videoDoc.sensitivity
        });
      }
    }, 700);
  } catch (err) {
    console.error("simulateProcessing err:", err);
  }
};

export const uploadVideoController = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file" });

    // Save db doc
    const video = await Video.create({
      user: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      status: "uploaded",
      sensitivity: "unknown",
      progress: 0
    });

    const io = req.app.get("io");
    if (io) io.to(String(req.user._id)).emit("video:uploaded", { videoId: video._id });

    // Kick off simulated processing (in-proc). Replace with worker for production.
    simulateProcessing(video, io);

    return res.status(201).json({ success: true, video });
  } catch (err) {
    console.error("uploadVideoController:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/video/all
 * Optional query params:
 *   - page (default 1)
 *   - limit (default 20)
 *   - status (processing/completed/failed/...)
 *   - sensitivity (safe/flagged/unknown)
 *   - q (search originalName)
 */
export const getAllVideos = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const query = { user: req.user._id }; // multi-tenant: only user's videos

    if (req.query.status) query.status = req.query.status;
    if (req.query.sensitivity) query.sensitivity = req.query.sensitivity;
    if (req.query.q) query.originalName = { $regex: req.query.q, $options: "i" };

    const [videos, total] = await Promise.all([
      Video.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Video.countDocuments(query)
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      videos
    });
  } catch (err) {
    console.error("getAllVideosController:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Streaming endpoint
 * GET /api/video/stream/:id
 */
export const streamVideoController = async (req, res) => {
  try {
    const vid = await Video.findById(req.params.id);
    if (!vid) return res.status(404).json({ success: false, message: "Video not found" });

    if (String(vid.user) !== String(req.user._id) && req.user.role === "Viewer") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const filePath = vid.path || path.join(UPLOAD_DIR, vid.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "File missing" });

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = vid.mimeType || mime.lookup(filePath) || "video/mp4";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize) {
        res.status(416).header("Content-Range", `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("streamVideoController:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
