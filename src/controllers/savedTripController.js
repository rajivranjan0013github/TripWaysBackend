import Trip from "../models/Trip.js";
import User from "../models/User.js";

// POST /api/trips — Save a generated trip
export const saveTrip = async (req, res, next) => {
    try {
        const { userId, destination, days, interests, itinerary, discoveredPlaces } = req.body;

        if (!userId || !destination) {
            return res.status(400).json({ error: "userId and destination are required" });
        }

        const trip = await Trip.create({
            userId,
            destination,
            days,
            interests,
            itinerary,
            discoveredPlaces,
        });

        // Add trip reference to the user's trips array
        await User.findByIdAndUpdate(userId, { $push: { trips: trip._id } });

        res.status(201).json({ success: true, trip });
    } catch (err) {
        next(err);
    }
};

// GET /api/trips/user/:userID — List user's trips (summary)
export const getUserTrips = async (req, res, next) => {
    try {
        const { userID } = req.params;
        const trips = await Trip.find({ userId: userID })
            .sort({ createdAt: -1 })
            .select("destination days interests createdAt")
            .lean();

        res.status(200).json({ success: true, trips });
    } catch (err) {
        next(err);
    }
};

// GET /api/trips/:tripID — Get full trip detail
export const getTrip = async (req, res, next) => {
    try {
        const { tripID } = req.params;
        const trip = await Trip.findById(tripID);
        if (!trip) return res.status(404).json({ error: "Trip not found" });

        res.status(200).json({ success: true, trip });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/trips/:tripID — Delete a trip
export const deleteTrip = async (req, res, next) => {
    try {
        const { tripID } = req.params;
        const trip = await Trip.findByIdAndDelete(tripID);
        if (!trip) return res.status(404).json({ error: "Trip not found" });

        // Remove trip reference from the user's trips array
        await User.findByIdAndUpdate(trip.userId, { $pull: { trips: trip._id } });

        res.status(200).json({ success: true, message: "Trip deleted" });
    } catch (err) {
        next(err);
    }
};
