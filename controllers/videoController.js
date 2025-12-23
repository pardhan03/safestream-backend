import { Video } from "../models/video.model.js";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { v4 as uuidv4 } from "uuid";
import { compressVideo } from "../utils/compressVideo.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads", "videos");

// Simple in-memory streaming cache for recent chunks (small-scale)
const streamCache = new Map(); // key -> { chunk: Buffer, headers, expiresAt }
const CACHE_TTL_MS = 60 * 1000; // keep cached chunk for 60s

const setCache = (key, data) => {
  streamCache.set(key, data);
  setTimeout(() => streamCache.delete(key), CACHE_TTL_MS);
};

// Simulated processing with compression step
// const simulateProcessing = async (videoDoc, io) => {
//   try {
//     videoDoc.status = "processing";
//     videoDoc.progress = 0;
//     await videoDoc.save();

//     let progress = 0;
//     const interval = setInterval(async () => {
//       progress += Math.floor(Math.random() * 15) + 5;
//       if (progress >= 100) progress = 100;

//       videoDoc.progress = progress;
//       await videoDoc.save();

//       if (io) io.to(String(videoDoc.user)).emit("video:progress", {
//         // Always emit as string (frontend stores _id as string)
//         videoId: String(videoDoc._id),
//         progress,
//         status: videoDoc.status
//       });

//       if (progress === 100) {
//         clearInterval(interval);

//         // compress the video into multiple qualities
//         try {
//           const inputPath = videoDoc.path;
//           const filenameBase = `${Date.now()}-${uuidv4()}-${videoDoc.filename}`;
//           const outputDir = path.join(path.dirname(inputPath), "compressed");
//           const compressedResult = await compressVideo(inputPath, outputDir, filenameBase);

//           // Save compressed file paths in DB
//           videoDoc.compressed = {
//             p360: compressedResult?.p360 || null,
//             p720: compressedResult?.p720 || null,
//             p1080: compressedResult?.p1080 || null
//           };

//         } catch (compressErr) {
//           console.error("Compression error:", compressErr);
//           // keep processing but mark failed compression
//         }

//         // Simulate sensitivity classification
//         const flagged = Math.random() < 0.12; // 12% chance
//         videoDoc.sensitivity = flagged ? "flagged" : "safe";
//         videoDoc.status = flagged ? "failed" : "completed";
//         videoDoc.progress = 100;
//         await videoDoc.save();

//         io.to(String(videoDoc.user)).emit("video:completed", {
//           videoId: String(videoDoc._id),
//           status: videoDoc.status,
//           sensitivity: videoDoc.sensitivity
//         });
//       }
//     }, 700);
//   } catch (err) {
//     console.error("simulateProcessing err:", err);
//   }
// };

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

    video.status = flagged ? "failed" : "completed";
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

    // Permission: owner or non-Viewer roles allowed
    if (String(vid.user) !== String(req.user._id) && req.user.role === "Viewer") {
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
      const buffers = [];
      stream.on("data", (b) => buffers.push(b));
      stream.on("end", () => {
        const chunk = Buffer.concat(buffers);
        // store in short-lived memory cache
        setCache(cacheKey, { chunk, headers });
        res.writeHead(206, headers);
        res.end(chunk);
      });
      stream.on("error", (err) => {
        console.error("stream error", err);
        res.status(500).end();
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
  const { id } = req.params;
  const video = await Video.findById(id);

  if (!video) return res.status(404).json({ message: "Not found" });
  console.log(req.user.role !== "Admin", video._id.toString(), req.user._id)
  if (req.user.role !== "Admin" && video.user.toString() !== req.user._id.toString()){
    return res.status(403).json({ message: "Unauthorized" });
  }

  fs.unlinkSync(video.path); // delete from storage
  if (video.compressed?.p360) fs.unlinkSync(video.compressed.p360);
  if (video.compressed?.p720) fs.unlinkSync(video.compressed.p720);
  if (video.compressed?.p1080) fs.unlinkSync(video.compressed.p1080);

  await video.deleteOne();

  res.json({ message: "Video deleted" });
};