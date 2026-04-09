import mongoose from "mongoose";

const DownloadErrorSchema = new mongoose.Schema(
    {
        // What was being downloaded
        url: {
            type: String,
            required: true,
        },
        platform: {
            type: String,
            enum: ["instagram", "tiktok", "youtube", "other"],
            default: "other",
        },

        // Error classification
        errorCode: {
            type: String,
            required: true,
            index: true,
            enum: [
                "NO_VIDEO_FORMATS",   // Image-only carousel — needs gallery-dl
                "LOGIN_REQUIRED",     // Cookies expired or missing
                "NOT_FOUND",          // Post deleted or private (404)
                "RATE_LIMITED",        // Too many anonymous requests / redirect to login
                "EXTRACTOR_ERROR",    // Platform extractor broke
                "GALLERY_DL_FAILED",  // gallery-dl fallback also failed
                "DOWNLOAD_TIMEOUT",   // Took too long
                "UNKNOWN",            // Catch-all
            ],
        },
        errorMessage: {
            type: String,
            required: true,
        },

        // Which tool failed
        tool: {
            type: String,
            enum: ["yt-dlp", "gallery-dl"],
            default: "yt-dlp",
        },

        // Context about the attempt
        cookiesUsed: {
            type: Boolean,
            default: false,
        },
        cookiesFile: {
            type: String,
            default: null,
        },
        outputFile: {
            type: String,
            default: null,
        },

        // Link back to the import (if applicable)
        importId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ImportedVideo",
            default: null,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // Whether the fallback (gallery-dl) succeeded after this error
        fallbackSucceeded: {
            type: Boolean,
            default: false,
        },

        // Stack trace for debugging
        stackTrace: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// Query patterns: recent errors, errors by code+platform
DownloadErrorSchema.index({ createdAt: -1 });
DownloadErrorSchema.index({ errorCode: 1, platform: 1 });
DownloadErrorSchema.index({ userId: 1, createdAt: -1 });

const DownloadError = mongoose.model("DownloadError", DownloadErrorSchema);

export default DownloadError;
