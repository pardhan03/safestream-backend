import { Video } from "../models/video.model.js";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { v4 as uuidv4 } from "uuid";
import { compressVideo } from "../utils/compressVideo.js";
import { buildVideoListQueryByRole, canManageVideo, canReadVideo } from "../utils/authorization.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads", "videos");

// Simple in-memory streaming cache for recent chunks (small-scale)
const streamCache = new Map(); // key -> { chunk: Buffer, headers, expiresAt }
const CACHE_TTL_MS = 60 * 1000; // keep cached chunk for 60s

const setCache = (key, data) => {
  streamCache.set(key, data);
  setTimeout(() => streamCache.delete(key), CACHE_TTL_MS);
};

const simulateProcessing = async (videoId, io) => {
  try {
    // Step 1: mark processing
    await Video.findByIdAndUpdate(videoId, {
      status: "processing",
      progress: 1,
    });

    // Step 2: deterministic progress updates
    for (let progress = 10; progress <= 90; progress += 10) {
      await new Promise((r) => setTimeout(r, 1500));

      const video = await Video.findByIdAndUpdate(
        videoId,
        { progress, status: "processing" },
        { new: true }
      );

      if (!video) return;

      io?.to(String(video.user)).emit("video:progress", {
        videoId: String(video._id),
        progress,
        status: "processing",
      });
    }

    // Step 3: compression
    const video = await Video.findById(videoId);
    if (!video) return;

    try {
      const inputPath = video.path;
      const filenameBase = `${Date.now()}-${uuidv4()}-${video.filename}`;
      const outputDir = path.join(path.dirname(inputPath), "compressed");

      const compressed = await compressVideo(
        inputPath,
        outputDir,
        filenameBase
      );

      video.compressed = {
        p360: compressed?.p360 || null,
        p720: compressed?.p720 || null,
        p1080: compressed?.p1080 || null,
      };
    } catch (err) {
      console.error("Compression failed:", err);
    }

    // Step 4: sensitivity decision
    const flagged = Math.random() < 0.12;

    video.status = "completed";
    video.sensitivity = flagged ? "flagged" : "safe";
    video.progress = 100;

    await video.save();

    io?.to(String(video.user)).emit("video:completed", {
      videoId: String(video._id),
      status: video.status,
      sensitivity: video.sensitivity,
    });
  } catch (err) {
    console.error("simulateProcessing error:", err);
  }
};

export const uploadVideoController = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file" });
    console.log('reached here', req)
    // Save db doc
    const video = await Video.create({
      user: req.user._id,
      filename: req.file.filename,
      organizationId: req.user.organizationId,
      assignedUsers: [req.user._id],
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      status: "uploaded",
      sensitivity: "unknown",
      progress: 0
    });

    const io = req.app.get("io");
    if (io) io.to(String(req.user._id)).emit("video:uploaded", { videoId: String(video._id) });

    // Kick off processing+compression (non-blocking)
    // simulateProcessing(video, io);
    simulateProcessing(video._id, io);


    return res.status(201).json({ success: true, video });
  } catch (err) {
    console.error("uploadVideoController:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllVideos = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // const query = { user: req.user._id }; // multi-tenant: only user's videos
    const query = buildVideoListQueryByRole(req.user);

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
    console.error("getAllVideos:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Streaming endpoint
 * GET /api/video/stream/:id
 * Accepts optional query param `q` values: original | p360 | p720 | p1080
 */
export const streamVideoController = async (req, res) => {
  try {
    const vid = await Video.findById(req.params.id);
    if (!vid) return res.status(404).json({ success: false, message: "Video not found" });

    if (!canReadVideo(req.user, vid)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Determine which file path to stream based on query
    const quality = req.query.q || "original"; // default original
    let filePath = vid.path;
    if (quality === "p360" && vid.compressed?.p360) filePath = vid.compressed.p360;
    if (quality === "p720" && vid.compressed?.p720) filePath = vid.compressed.p720;
    if (quality === "p1080" && vid.compressed?.p1080) filePath = vid.compressed.p1080;

    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "File missing" });

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = vid.mimeType || mime.lookup(filePath) || "video/mp4";

    // Streaming with simple chunk-level cache
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize) {
        res.status(416).header("Content-Range", `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = (end - start) + 1;

      const cacheKey = `${vid._id}:${quality}:${start}-${end}`;
      if (streamCache.has(cacheKey)) {
        const cached = streamCache.get(cacheKey);
        // renew TTL by re-setting
        setCache(cacheKey, cached);
        res.writeHead(206, cached.headers);
        return res.end(cached.chunk);
      }

      const headers = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      };

      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, headers);
      stream.pipe(res);

      stream.on("error", (err) => {
        console.error(err);
        res.end();
      });
    } else {
      // Full file (no range)
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("streamVideoController:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await Video.findById(id);
    if (!video) return res.status(404).json({ message: "Not found" });
    if (!canManageVideo(req.user, video)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const safeDelete = (filePath) => {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    };
    safeDelete(video.path);
    safeDelete(video.compressed?.p360);
    safeDelete(video.compressed?.p720);
    safeDelete(video.compressed?.p1080);
    await video.deleteOne();
    return res.json({ message: "Video deleted" });
  } catch (err) {
    console.error("deleteVideo:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const assignUsersToVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds = [] } = req.body;

    const video = await Video.findById(id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (req.user.role !== "Admin" || req.user.organizationId !== video.organizationId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    video.assignedUsers = [...new Set(userIds.map(String))];
    await video.save();

    return res.json({ success: true, video });
  } catch (e) {
    console.error("assignUsersToVideo:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const unassignUserFromVideo = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const video = await Video.findById(id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (req.user.role !== "Admin" || req.user.organizationId !== video.organizationId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    video.assignedUsers = (video.assignedUsers || []).filter((u) => String(u) !== String(userId));
    await video.save();

    return res.json({ success: true, video });
  } catch (e) {
    console.error("unassignUserFromVideo:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};