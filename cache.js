import Redis  from "ioredis";
const redis = new Redis();

export const cacheVideo = async (videoPath, buffer) => {
  await redis.set(videoPath, buffer);
};

export const getCachedVideo = async (videoPath) => {
  return await redis.getBuffer(videoPath);
};
