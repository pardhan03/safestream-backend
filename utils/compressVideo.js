import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

const processOne = (inputPath, outputPath, size, bitrate) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-preset fast",
        `-b:v ${bitrate}`,
        "-c:a aac",
        "-movflags +faststart"
      ])
      .size(size)
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

export const compressVideo = async (inputPath, outputDir, filenameBase) => {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const targets = [
    { label: "p360", size: "640x360", bitrate: "800k" },
    { label: "p720", size: "1280x720", bitrate: "1500k" },
    { label: "p1080", size: "1920x1080", bitrate: "3000k" },
  ];

  const result = {};

  for (const t of targets) {
    const outPath = path.join(outputDir, `${t.label}-${filenameBase}`);
    await processOne(inputPath, outPath, t.size, t.bitrate);
    result[t.label] = outPath;
  }

  return result;
};
