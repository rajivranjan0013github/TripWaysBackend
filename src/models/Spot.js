import mongoose from "mongoose";

const SpotSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        country: {
            type: String,
            required: true,
        },
        city: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        placeId: {
            type: String,
            default: null,
        },
        address: {
            type: String,
            default: "",
        },
        rating: {
            type: Number,
            default: null,
        },
        userRatingCount: {
            type: Number,
            default: null,
        },
        photoUrl: {
            type: String,
            default: null,
        },
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        source: {
            type: String,
            enum: ["video", "manual", "trip", "share_extension", "discovery"],
            default: "manual",
        },
    },
    { timestamps: true }
);

// Compound index for efficient grouped queries
SpotSchema.index({ userId: 1, country: 1, city: 1 });

const Spot = mongoose.model("Spot", SpotSchema);

export default Spot;
