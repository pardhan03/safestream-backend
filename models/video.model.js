import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded"
    },

    sensitivity: {
      type: String,
      enum: ["unknown", "safe", "flagged"],
      default: "unknown"
    },

    progress: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

export const Video = mongoose.model("Video", videoSchema);
