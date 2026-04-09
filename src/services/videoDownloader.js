import youtubedl from "youtube-dl-exec";
import { create as createYtdl } from "youtube-dl-exec";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { logDownloadError } from "../utils/logDownloadError.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root (two levels up from src/services/)
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Cookies files (live in project root)
const IG_COOKIES_FILE = path.join(PROJECT_ROOT, "cookies.txt");
const TIKTOK_COOKIES_FILE = path.join(PROJECT_ROOT, "tiktok.txt");

// Ensure tmp directory exists
const TEMP_DIR = path.join(PROJECT_ROOT, "tmp");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Try to use system yt-dlp (Homebrew) if available, otherwise fall back to bundled
let ytdlpBinary = null;
try {
    const homebrewPath = "/opt/homebrew/bin/yt-dlp";
    if (fs.existsSync(homebrewPath)) {
        ytdlpBinary = homebrewPath;
    }
} catch { /* use default */ }

const ytdlpInstance = ytdlpBinary ? createYtdl(ytdlpBinary) : youtubedl;

// Auto-discover gallery-dl binary (macOS Homebrew or Linux system path)
let galleryDlBinary = null;
for (const candidate of ["/opt/homebrew/bin/gallery-dl", "/usr/local/bin/gallery-dl", "/usr/bin/gallery-dl"]) {
    try {
        if (fs.existsSync(candidate)) {
            galleryDlBinary = candidate;
            break;
        }
    } catch { /* try next */ }
}
if (!galleryDlBinary) {
    // Fallback: assume it's on PATH (will fail gracefully if not installed)
    galleryDlBinary = "gallery-dl";
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getYtDlpEnv() {
    return {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.PATH}`,
    };
}

/**
 * Returns platform-aware headers for yt-dlp.
 * Instagram needs an Instagram referer to avoid bot detection.
 */
function getYtDlpHeaders(videoUrl = "") {
    const isInstagram = videoUrl.includes("instagram.com") || videoUrl.includes("instagr.am");
    const isTikTok = videoUrl.includes("tiktok.com");
    return [
        `referer:${isTikTok ? "https://www.tiktok.com/" : (isInstagram ? "https://www.instagram.com/" : "https://www.youtube.com/")}`,
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    ];
}

/**
 * Check if a valid platform-specific cookies file exists and return its path, or null.
 * YouTube does not need cookies — returns null for YouTube URLs.
 */
function getCookiesFileIfExists(videoUrl = "") {
    const isTikTok = videoUrl.includes("tiktok.com");
    const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");

    // YouTube does not need authenticated cookies
    if (isYouTube) return null;

    const cookiesFile = isTikTok ? TIKTOK_COOKIES_FILE : IG_COOKIES_FILE;
    try {
        if (fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 10) {
            return cookiesFile;
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * Build common yt-dlp options with optional cookies.
 */
function buildYtDlpOptions(videoUrl, extraOptions = {}) {
    const cookiesFile = getCookiesFileIfExists(videoUrl);
    const opts = {
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: getYtDlpHeaders(videoUrl),
        ...extraOptions,
    };
    if (cookiesFile) {
        opts.cookies = cookiesFile;
    }
    return { opts, cookiesFile };
}

function detectPlatform(metadata = {}, videoUrl = "") {
    const haystack = `${metadata.extractor || ""} ${metadata.extractor_key || ""} ${videoUrl}`.toLowerCase();
    if (haystack.includes("instagram") || haystack.includes("instagr")) return "instagram";
    if (haystack.includes("tiktok")) return "tiktok";
    if (haystack.includes("youtube")) return "youtube";
    return "other";
}

/**
 * Check if an error message indicates an image carousel (no video formats).
 * Covers Instagram carousels, TikTok slideshows, and edge cases.
 */
function isCarouselError(message = "") {
    return message.includes("No video formats found")
        || message.includes("NoneType")
        || message.includes("ExtractorError")
        || message.includes("Requested format is not available") // TikTok slideshows
        || message.includes("is not a video")                    // catch-all for non-video
        || message.includes("Unsupported URL");                   // edge case
}

// ─── Core Functions ─────────────────────────────────────────────────────

export async function getVideoMetadata(videoUrl) {
    try {
        const { opts } = buildYtDlpOptions(videoUrl, {
            dumpSingleJson: true,
            skipDownload: true,
        });

        const metadata = await ytdlpInstance(videoUrl, opts, {
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

export async function cleanupDownloadedVideo(filePath) {
    if (!filePath) return;
    try {
        await fsp.unlink(filePath);
    } catch (error) {
        // File already deleted or doesn't exist — that's fine
        if (error.code !== "ENOENT") {
            console.warn("⚠️ Failed to delete temp file:", error.message);
        }
    }
}

/**
 * Cleanup multiple files (used for carousel images).
 */
export async function cleanupDownloadedFiles(filePaths = []) {
    await Promise.all(filePaths.map(fp => cleanupDownloadedVideo(fp)));
}

/**
 * Downloads a video from a URL to a local temp file.
 * Returns the absolute path to the downloaded .mp4 file.
 *
 * @param {string} videoUrl
 * @param {Object} context - Optional context for error logging (importId, userId)
 * @returns {Promise<string>} Absolute path to the local video file
 */
export async function downloadVideo(videoUrl, context = {}) {
    const id = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(TEMP_DIR, `video_${id}.mp4`);

    const { opts, cookiesFile } = buildYtDlpOptions(videoUrl, {
        output: outputPath,
        format: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        mergeOutputFormat: "mp4",
    });

    try {
        await ytdlpInstance(videoUrl, opts, {
            env: getYtDlpEnv(),
        });

        try {
            await fsp.access(outputPath);
        } catch {
            throw new Error("Download completed but file not found.");
        }

        return outputPath;
    } catch (error) {
        console.error("❌ Failed to download video:", error.message?.split("\n")[0]);

        // Log the error
        await logDownloadError({
            url: videoUrl,
            platform: detectPlatform({}, videoUrl),
            errorMessage: error.message,
            tool: "yt-dlp",
            cookiesUsed: !!cookiesFile,
            cookiesFile,
            outputFile: outputPath,
            importId: context.importId || null,
            userId: context.userId || null,
        });

        try { await fsp.unlink(outputPath); } catch { /* ignore */ }
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}

/**
 * Downloads a video AND extracts metadata in a SINGLE yt-dlp call.
 * Uses --print-json which outputs metadata JSON to stdout while downloading.
 *
 * @param {string} videoUrl
 * @param {Object} context - Optional context for error logging (importId, userId)
 * @returns {Promise<{ filePath: string, metadata: Object }>}
 */
export async function downloadVideoWithMetadata(videoUrl, context = {}) {
    const id = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(TEMP_DIR, `video_${id}.mp4`);

    const { opts, cookiesFile } = buildYtDlpOptions(videoUrl, {
        output: outputPath,
        format: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        mergeOutputFormat: "mp4",
        printJson: true,
    });

    try {
        const metadata = await ytdlpInstance(videoUrl, opts, {
            env: getYtDlpEnv(),
        });

        try {
            await fsp.access(outputPath);
        } catch {
            throw new Error("Download completed but file not found.");
        }

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
        console.error("❌ Failed to download video with metadata:", error.message?.split("\n")[0]);

        // Log the error
        await logDownloadError({
            url: videoUrl,
            platform: detectPlatform({}, videoUrl),
            errorMessage: error.message,
            tool: "yt-dlp",
            cookiesUsed: !!cookiesFile,
            cookiesFile,
            outputFile: outputPath,
            importId: context.importId || null,
            userId: context.userId || null,
        });

        try { await fsp.unlink(outputPath); } catch { /* ignore */ }
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}

/**
 * Attempt to download carousel images using gallery-dl (async).
 * Returns an array of downloaded file paths.
 *
 * @param {string} url - Instagram carousel URL
 * @param {Object} context - Optional context for error logging
 * @returns {Promise<string[]>} Array of absolute paths to downloaded images
 */
async function downloadWithGalleryDl(url, context = {}) {
    const cookiesFile = getCookiesFileIfExists(url);
    const carouselDir = path.join(TEMP_DIR, `carousel_${crypto.randomBytes(6).toString("hex")}`);
    await fsp.mkdir(carouselDir, { recursive: true });

    // Build gallery-dl command args
    const args = [];
    if (cookiesFile) {
        args.push("--cookies", cookiesFile);
    }
    args.push("-D", carouselDir, url);


    try {
        await execFileAsync(galleryDlBinary, args, {
            env: getYtDlpEnv(),
            timeout: 60000, // 60s timeout
        });

        // Collect all downloaded files (images)
        const allFiles = await fsp.readdir(carouselDir);
        const files = allFiles
            .filter(f => /\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(f))
            .map(f => path.join(carouselDir, f));

        if (files.length === 0) {
            throw new Error("gallery-dl completed but no media files found in output directory.");
        }

        return files;
    } catch (error) {

        // Log the gallery-dl error
        await logDownloadError({
            url,
            platform: detectPlatform({}, url),
            errorMessage: error.message,
            tool: "gallery-dl",
            cookiesUsed: !!cookiesFile,
            cookiesFile,
            outputFile: carouselDir,
            importId: context.importId || null,
            userId: context.userId || null,
        });

        // Cleanup the empty carousel dir
        try { await fsp.rm(carouselDir, { recursive: true, force: true }); } catch { /* ignore */ }

        throw new Error(`gallery-dl failed: ${error.message}`);
    }
}

/**
 * Smart download: attempts download+metadata in ONE yt-dlp call.
 * Falls back to gallery-dl for image carousels.
 *
 * Returns either:
 *   - { type: "video", filePath: string, metadata: Object }
 *   - { type: "carousel", filePaths: string[], metadata: Object }
 *
 * @param {string} videoUrl
 * @param {Object} context - Optional { importId, userId } for error logging
 * @returns {Promise<Object>}
 */
export async function downloadMediaWithMetadata(videoUrl, context = {}) {
    const id = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(TEMP_DIR, `video_${id}.mp4`);

    // ── SINGLE yt-dlp call: download + metadata combined via --print-json ──
    const { opts, cookiesFile } = buildYtDlpOptions(videoUrl, {
        output: outputPath,
        format: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        mergeOutputFormat: "mp4",
        printJson: true,
    });

    try {
        const metadata = await ytdlpInstance(videoUrl, opts, { env: getYtDlpEnv() });

        // Verify file exists
        try {
            await fsp.access(outputPath);
        } catch {
            throw new Error("Download completed but file not found.");
        }

        const parsedMetadata = {
            title: metadata?.title || "",
            caption: metadata?.description || "",
            thumbnailUrl: metadata?.thumbnail || null,
            normalizedUrl: metadata?.webpage_url || videoUrl,
            sourceVideoId: metadata?.id || null,
            platform: detectPlatform(metadata, videoUrl),
            raw: metadata,
        };

        return { type: "video", filePath: outputPath, metadata: parsedMetadata };
    } catch (error) {
        // ── If it looks like an image carousel, fall back to gallery-dl ──
        if (isCarouselError(error.message || "")) {

            // Log the yt-dlp soft failure
            await logDownloadError({
                url: videoUrl,
                platform: detectPlatform({}, videoUrl),
                errorMessage: error.message,
                tool: "yt-dlp",
                cookiesUsed: !!cookiesFile,
                cookiesFile,
                importId: context.importId || null,
                userId: context.userId || null,
                fallbackSucceeded: false,
            });

            // Clean up the failed output file
            try { await fsp.unlink(outputPath); } catch { /* ignore */ }

            // Try gallery-dl for carousel images
            const filePaths = await downloadWithGalleryDl(videoUrl, context);

            // Quick metadata fetch (lightweight, no download) for caption/title
            let carouselMetadata = {
                title: "",
                caption: "",
                thumbnailUrl: null,
                normalizedUrl: videoUrl,
                sourceVideoId: null,
                platform: detectPlatform({}, videoUrl),
                raw: null,
            };

            // Try to get metadata from a lighter approach (won't fail the whole flow)
            try {
                const { opts: metaOpts } = buildYtDlpOptions(videoUrl, {
                    dumpSingleJson: true,
                    skipDownload: true,
                });
                const meta = await ytdlpInstance(videoUrl, metaOpts, { env: getYtDlpEnv() });
                carouselMetadata = {
                    title: meta?.title || "",
                    caption: meta?.description || "",
                    thumbnailUrl: meta?.thumbnail || null,
                    normalizedUrl: meta?.webpage_url || videoUrl,
                    sourceVideoId: meta?.id || null,
                    platform: detectPlatform(meta, videoUrl),
                    raw: meta,
                };
            } catch {
                console.warn("⚠️ [downloadMedia] Could not fetch carousel metadata (non-fatal)");
            }

            return { type: "carousel", filePaths, metadata: carouselMetadata };
        }

        // ── Not a carousel — a real download error ──
        console.error("❌ [downloadMedia] yt-dlp download failed:", error.message?.split("\n")[0]);

        await logDownloadError({
            url: videoUrl,
            platform: detectPlatform({}, videoUrl),
            errorMessage: error.message,
            tool: "yt-dlp",
            cookiesUsed: !!cookiesFile,
            cookiesFile,
            outputFile: outputPath,
            importId: context.importId || null,
            userId: context.userId || null,
        });

        try { await fsp.unlink(outputPath); } catch { /* ignore */ }
        throw new Error(`Could not download media from URL: ${error.message}`);
    }
}
