import express from "express";
import secureRoute from "../middlewares/secureRoute.js";
import { uploadVideo } from "../middlewares/upload.js";
import { getAllVideos, streamVideoController, uploadVideoController } from "../controllers/videoController.js";
import { permit } from "../middlewares/permit.js";

const router = express.Router();

// router.post(
//   "/upload",
//   secureRoute,
//   uploadVideo.single("video"),
//   uploadVideoController
// );
router.post("/upload", secureRoute, permit("Editor", "Admin"), uploadVideo.single("video"), uploadVideoController);

router.get("/all", secureRoute, getAllVideos);
router.get("/stream/:id", secureRoute, streamVideoController);

export default router;
