import youtubedl from "youtube-dl-exec";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure tmp directory exists
const TEMP_DIR = path.join(__dirname, "..", "..", "tmp");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Downloads a video from a URL (YouTube, TikTok, Instagram, etc) to a local temp file.
 * Returns the absolute path to the downloaded .mp4 file.
 * 
 * @param {string} videoUrl 
 * @returns {Promise<string>} Absolute path to the local video file
 */
export async function downloadVideo(videoUrl) {
    // Create a unique filename for concurrent requests
    const id = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(TEMP_DIR, `video_${id}.mp4`);

    const dlStart = Date.now();

    try {
        // We request worst supported video quality (max 480p) since we only want Gemini to extract context
        // This dramatically speeds up the download and upload time.
        await youtubedl(videoUrl, {
            output: outputPath,
            format: "worstvideo[ext=mp4]+bestaudio[ext=m4a]/worst",
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                "referer:youtube.com",
                "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
            ]
        }, {
            // Force yt-dlp to use the Homebrew Python 3.14 we just installed
            env: {
                ...process.env,
                PATH: `/opt/homebrew/bin:${process.env.PATH}`
            }
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error("Download completed but file not found.");
        }

        return outputPath;
    } catch (error) {
        console.error("❌ Failed to download video:", error);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}
