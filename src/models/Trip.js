import mongoose from "mongoose";

const TripSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        destination: {
            type: String,
            required: true,
        },
        days: {
            type: Number,
            required: true,
        },
        interests: {
            type: [String],
            default: [],
        },
        itinerary: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        discoveredPlaces: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    { timestamps: true }
);

const Trip = mongoose.model("Trip", TripSchema);

export default Trip;
