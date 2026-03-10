import Trip from "../models/Trip.js";
import User from "../models/User.js";

// POST /api/trips — Save a generated trip
export const saveTrip = async (req, res, next) => {
    try {
        const { userId, destination, days, interests, itinerary, discoveredPlaces } = req.body;

        if (!userId || !destination) {
            return res.status(400).json({ error: "userId and destination are required" });
        }

        // Pick the best image from discoveredPlaces to represent this trip
        let tripRepPic = null;
        if (Array.isArray(discoveredPlaces) && discoveredPlaces.length > 0) {
            const withPhotos = discoveredPlaces
                .filter(p => p.photoUrl && p.rating && p.userRatingCount)
                .sort((a, b) => {
                    const scoreA = a.rating * Math.log10(a.userRatingCount || 1);
                    const scoreB = b.rating * Math.log10(b.userRatingCount || 1);
                    return scoreB - scoreA;
                });
            if (withPhotos.length > 0) {
                tripRepPic = withPhotos[0].photoUrl;
            }
        }

        const trip = await Trip.create({
            userId,
            destination,
            days,
            interests,
            itinerary,
            discoveredPlaces,
            tripRepPic,
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
            .select("destination days interests createdAt tripRepPic")
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

// PATCH /api/trips/:tripID — Update a trip (itinerary, etc.)
export const updateTrip = async (req, res, next) => {
    try {
        console.log(`[updateTrip] Called for trip ID: ${req.params.tripID}`);
        const { tripID } = req.params;
        const { itinerary, discoveredPlaces } = req.body;

        const updateData = {};
        if (itinerary) updateData.itinerary = itinerary;
        if (discoveredPlaces) updateData.discoveredPlaces = discoveredPlaces;

        // Optionally recalculate the tripRepPic if discoveredPlaces changed
        if (discoveredPlaces && Array.isArray(discoveredPlaces) && discoveredPlaces.length > 0) {
            const withPhotos = discoveredPlaces
                .filter(p => p.photoUrl && p.rating && p.userRatingCount)
                .sort((a, b) => {
                    const scoreA = a.rating * Math.log10(a.userRatingCount || 1);
                    const scoreB = b.rating * Math.log10(b.userRatingCount || 1);
                    return scoreB - scoreA;
                });
            if (withPhotos.length > 0) {
                updateData.tripRepPic = withPhotos[0].photoUrl;
            }
        }

        const updatedTrip = await Trip.findByIdAndUpdate(
            tripID,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedTrip) {
            console.log(`[updateTrip] Trip not found: ${tripID}`);
            return res.status(404).json({ error: "Trip not found" });
        }

        console.log(`[updateTrip] Successfully updated trip: ${tripID}`);
        res.status(200).json({ success: true, trip: updatedTrip });
    } catch (err) {
        console.error(`[updateTrip] Error updating trip:`, err);
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
