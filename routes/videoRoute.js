import express from "express";
import secureRoute from "../middlewares/secureRoute.js";
import { uploadVideo } from "../middlewares/upload.js";
import {
    deleteVideo,
    getAllVideos,
    streamVideoController,
    uploadVideoController,
    assignUsersToVideo,
    unassignUserFromVideo
} from "../controllers/videoController.js";
import { permit } from "../middlewares/permit.js";

const router = express.Router();

router.post("/upload", secureRoute, permit("Editor", "Admin"), uploadVideo.single("video"), uploadVideoController);
router.get("/all", secureRoute, permit("Viewer", "Editor", "Admin"), getAllVideos);
router.get("/stream/:id", secureRoute, permit("Viewer", "Editor", "Admin"), streamVideoController);

// viewer should never delete
router.delete("/:id", secureRoute, permit("Editor", "Admin"), deleteVideo);

// (admin)
router.post("/:id/assign", secureRoute, permit("Admin"), assignUsersToVideo);
router.delete("/:id/assign/:userId", secureRoute, permit("Admin"), unassignUserFromVideo);

export default router;
