import mongoose from "mongoose";

const ImportedVideoSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        platform: {
            type: String,
            enum: ["instagram", "tiktok", "youtube", "other"],
            default: "other",
        },
        mediaType: {
            type: String,
            enum: ["video", "carousel"],
            default: "video",
        },
        status: {
            type: String,
            enum: ["processing", "completed", "failed"],
            default: "processing",
            index: true,
        },
        originalUrl: {
            type: String,
            required: true,
        },
        normalizedUrl: {
            type: String,
            default: "",
        },
        sourceVideoId: {
            type: String,
            default: null,
        },
        title: {
            type: String,
            default: "",
        },
        caption: {
            type: String,
            default: "",
        },
        thumbnailUrl: {
            type: String,
            default: null,
        },
        cloudflareVideoUrl: {
            type: String,
            default: null,
        },
        cloudflareAssetKey: {
            type: String,
            default: null,
        },
        aiTranscript: {
            type: String,
            default: "",
        },
        aiUnderstanding: {
            type: String,
            default: "",
        },
        destination: {
            type: String,
            default: "",
        },
        locations: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        resolvedPlaces: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        totalExtractedPlaces: {
            type: Number,
            default: 0,
        },
        savedSpotCount: {
            type: Number,
            default: 0,
        },
        savedSpotIds: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Spot",
                },
            ],
            default: [],
        },
        processingTimeSeconds: {
            type: Number,
            default: null,
        },
        failureReason: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

ImportedVideoSchema.index({ userId: 1, createdAt: -1 });
ImportedVideoSchema.index({ userId: 1, normalizedUrl: 1 });
ImportedVideoSchema.index({ sourceVideoId: 1, status: 1 }, { sparse: true });

const ImportedVideo = mongoose.model("ImportedVideo", ImportedVideoSchema);

export default ImportedVideo;
