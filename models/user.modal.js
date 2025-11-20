import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["Viewer", "Editor", "Admin"],
        default: "Editor"
    },
    avatar: {
        type: String,
        default: ""
    },
    organizationId: {
        type: String,
        default: null
    }
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);