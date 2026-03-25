import mongoose from "mongoose";

const eqId = (a, b) => String(a) === String(b);

export const isSameTenant = (user, resource) =>
  user?.organizationId && resource?.organizationId && user.organizationId === resource.organizationId;

export const canReadVideo = (user, video) => {
  if (!user || !video) return false;
  if (!isSameTenant(user, video)) return false;

  if (user.role === "Admin") return true;
  if (user.role === "Editor") {
    // owner-only editor access (safe default)
    return eqId(video.user, user._id);
  }
  if (user.role === "Viewer") {
    return (video.assignedUsers || []).some((id) => eqId(id, user._id));
  }
  return false;
};

export const canManageVideo = (user, video) => {
  if (!user || !video) return false;
  if (!isSameTenant(user, video)) return false;

  if (user.role === "Admin") return true;
  if (user.role === "Editor") return eqId(video.user, user._id);
  return false; // Viewer never manage
};

export const buildVideoListQueryByRole = (user) => {
  const base = { organizationId: user.organizationId };

  if (user.role === "Admin") return base;
  if (user.role === "Editor") return { ...base, user: new mongoose.Types.ObjectId(user._id) };
  if (user.role === "Viewer") {
    return { ...base, assignedUsers: new mongoose.Types.ObjectId(user._id) };
  }
  return { _id: null }; // deny by default
};