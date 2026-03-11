import mongoose from "mongoose";

const TemplateTripSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },
        destination: {
            type: String,
            required: true,
        },
        days: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        coverImage: {
            type: String,
            default: null,
        },
        tags: {
            type: [String],
            default: [],
        },
        spots: {
            type: Number,
            default: 0,
        },
        itinerary: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        discoveredPlaces: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const TemplateTrip = mongoose.model("TemplateTrip", TemplateTripSchema);

export default TemplateTrip;
