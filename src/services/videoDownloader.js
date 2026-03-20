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

function getYtDlpEnv() {
    return {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.PATH}`
    };
}

function getYtDlpHeaders() {
    return [
        "referer:youtube.com",
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    ];
}

function detectPlatform(metadata = {}, videoUrl = "") {
    const haystack = `${metadata.extractor || ""} ${metadata.extractor_key || ""} ${videoUrl}`.toLowerCase();
    if (haystack.includes("instagram") || haystack.includes("instagr")) return "instagram";
    if (haystack.includes("tiktok")) return "tiktok";
    if (haystack.includes("youtube")) return "youtube";
    return "other";
}

export async function getVideoMetadata(videoUrl) {
    try {
        const metadata = await youtubedl(videoUrl, {
            dumpSingleJson: true,
            skipDownload: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: getYtDlpHeaders(),
        }, {
            env: getYtDlpEnv(),
        });

        return {
            title: metadata?.title || "",
            caption: metadata?.description || "",
            thumbnailUrl: metadata?.thumbnail || null,
            normalizedUrl: metadata?.webpage_url || videoUrl,
            sourceVideoId: metadata?.id || null,
            platform: detectPlatform(metadata, videoUrl),
            raw: metadata,
        };
    } catch (error) {
        console.warn("⚠️ Failed to fetch video metadata:", error.message);
        return {
            title: "",
            caption: "",
            thumbnailUrl: null,
            normalizedUrl: videoUrl,
            sourceVideoId: null,
            platform: detectPlatform({}, videoUrl),
            raw: null,
        };
    }
}

export function cleanupDownloadedVideo(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.warn("⚠️ Failed to delete temp video:", error.message);
    }
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
        // We request low quality (max 480p) since we only want Gemini to extract context.
        // Use best[height<=480] to ensure we ALWAYS get a video+audio stream (not audio-only).
        // --recode-video mp4 ensures iOS-compatible H.264/AAC codec.
        await youtubedl(videoUrl, {
            output: outputPath,
            format: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            mergeOutputFormat: "mp4",
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: getYtDlpHeaders()
        }, {
            env: getYtDlpEnv()
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error("Download completed but file not found.");
        }

        const dlElapsed = ((Date.now() - dlStart) / 1000).toFixed(1);
        const fileSizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);

        return outputPath;
    } catch (error) {
        console.error("❌ Failed to download video:", error);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}

/**
 * Downloads a video AND extracts metadata in a SINGLE yt-dlp call.
 * Uses --print-json which outputs metadata JSON to stdout while downloading.
 * This is ~6s faster than calling getVideoMetadata() + downloadVideo() separately.
 *
 * @param {string} videoUrl
 * @returns {Promise<{ filePath: string, metadata: Object }>}
 */
export async function downloadVideoWithMetadata(videoUrl) {
    const id = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(TEMP_DIR, `video_${id}.mp4`);
    const dlStart = Date.now();

    try {
        // --print-json makes yt-dlp output metadata JSON to stdout while also downloading
        const metadata = await youtubedl(videoUrl, {
            output: outputPath,
            format: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            mergeOutputFormat: "mp4",
            noCheckCertificates: true,
            noWarnings: true,
            printJson: true,
            addHeader: getYtDlpHeaders(),
        }, {
            env: getYtDlpEnv(),
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error("Download completed but file not found.");
        }

        const dlElapsed = ((Date.now() - dlStart) / 1000).toFixed(1);
        const fileSizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);

        const parsedMetadata = {
            title: metadata?.title || "",
            caption: metadata?.description || "",
            thumbnailUrl: metadata?.thumbnail || null,
            normalizedUrl: metadata?.webpage_url || videoUrl,
            sourceVideoId: metadata?.id || null,
            platform: detectPlatform(metadata, videoUrl),
            raw: metadata,
        };

        return { filePath: outputPath, metadata: parsedMetadata };
    } catch (error) {
        console.error("❌ Failed to download video with metadata:", error);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}
