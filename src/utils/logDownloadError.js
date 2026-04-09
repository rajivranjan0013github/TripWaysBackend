import DownloadError from "../models/DownloadError.js";

/**
 * Classify a raw error message from yt-dlp or gallery-dl into a structured error code.
 * @param {string} message - The raw error message
 * @returns {string} One of the DownloadError.errorCode enum values
 */
export function classifyError(message = "") {
    const msg = message.toLowerCase();

    if (msg.includes("no video formats found") || msg.includes("unsupported url")) {
        return "NO_VIDEO_FORMATS";
    }
    if (msg.includes("sign in") || msg.includes("login") || msg.includes("authentication")) {
        // Distinguish rate-limiting (redirect) from actual login requirement
        if (msg.includes("redirect")) {
            return "RATE_LIMITED";
        }
        return "LOGIN_REQUIRED";
    }
    if (msg.includes("404") || msg.includes("not found") || msg.includes("does not exist")) {
        return "NOT_FOUND";
    }
    if (msg.includes("redirect") || msg.includes("rate limit") || msg.includes("too many")) {
        return "RATE_LIMITED";
    }
    if (msg.includes("extractorerror") || msg.includes("nonetype") || msg.includes("extractor")) {
        return "EXTRACTOR_ERROR";
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
        return "DOWNLOAD_TIMEOUT";
    }
    return "UNKNOWN";
}

/**
 * Log a download error to the database.
 * This is fire-and-forget — it never throws so callers don't need to worry about it.
 *
 * @param {Object} params
 * @param {string} params.url - The URL that was being downloaded
 * @param {string} params.platform - e.g. "instagram", "youtube"
 * @param {string} params.errorMessage - Raw error message
 * @param {string} params.tool - "yt-dlp" or "gallery-dl"
 * @param {boolean} params.cookiesUsed - Whether cookies were passed
 * @param {string|null} params.cookiesFile - Path to the cookies file
 * @param {string|null} params.outputFile - Intended output file path
 * @param {string|null} params.importId - MongoDB ObjectId of the ImportedVideo
 * @param {string|null} params.userId - MongoDB ObjectId of the User
 * @param {boolean} params.fallbackSucceeded - Whether gallery-dl succeeded after yt-dlp failed
 * @returns {Promise<string>} The classified error code
 */
export async function logDownloadError({
    url,
    platform = "other",
    errorMessage = "",
    tool = "yt-dlp",
    cookiesUsed = false,
    cookiesFile = null,
    outputFile = null,
    importId = null,
    userId = null,
    fallbackSucceeded = false,
}) {
    const errorCode = classifyError(errorMessage);

    try {
        await DownloadError.create({
            url,
            platform,
            errorCode,
            errorMessage: errorMessage.slice(0, 2000), // cap at 2000 chars
            tool,
            cookiesUsed,
            cookiesFile,
            outputFile,
            importId,
            userId,
            fallbackSucceeded,
            stackTrace: new Error().stack?.split("\n").slice(1, 8).join("\n") || "",
        });
    } catch (e) {
        // Never let logging crash the main flow
        console.error("⚠️ [logDownloadError] Failed to persist error:", e.message);
    }

    return errorCode;
}
