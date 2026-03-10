import Spot from "../models/Spot.js";
import User from "../models/User.js";
import { fetchPlaceDetails } from "../services/placesService.js";

/**
 * POST /api/spots — Save spots (batch).
 * Accepts an array of spots to save at once (e.g., from video extraction).
 * Body: { userId, spots: [{ country, city, name, placeId, address, rating, photoUrl, coordinates, source }] }
 */
export const saveSpots = async (req, res, next) => {
    try {
        const { userId, spots } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }
        if (!Array.isArray(spots) || spots.length === 0) {
            return res.status(400).json({ error: "spots array is required and must not be empty" });
        }

        // Add userId to each spot
        const spotsToInsert = spots.map(spot => ({
            userId,
            country: spot.country || "Unknown",
            city: spot.city || "Unknown",
            name: spot.name,
            placeId: spot.placeId || spot.id || null,
            address: spot.address || "",
            rating: spot.rating || null,
            userRatingCount: spot.userRatingCount || 0,
            photoUrl: spot.photoUrl || null,
            coordinates: spot.coordinates || { lat: null, lng: null },
            source: spot.source || "video",
        }));

        // Skip duplicates: don't insert spots that already exist for this user (same placeId)
        const existingSpots = await Spot.find({
            userId,
            placeId: { $in: spotsToInsert.filter(s => s.placeId).map(s => s.placeId) },
        }).lean();
        const existingPlaceIds = new Set(existingSpots.map(s => s.placeId));

        const newSpots = spotsToInsert.filter(s => !s.placeId || !existingPlaceIds.has(s.placeId));

        if (newSpots.length === 0) {
            return res.status(200).json({
                success: true,
                message: "All spots already saved",
                savedCount: 0,
                spots: existingSpots,
            });
        }

        // Enrich spots that are missing crucial data (photo, coordinates, or rating)
        // This is usually the case for manual saves where the frontend sends ONLY placeId.
        const enrichedSpots = await Promise.all(newSpots.map(async (spot) => {
            if (spot.placeId && (!spot.photoUrl || !spot.coordinates?.lat || spot.rating === null)) {
                try {
                    console.log(`[Enrichment] Fetching details for placeId: ${spot.placeId}`);
                    const details = await fetchPlaceDetails(spot.placeId);
                    if (details) {
                        return {
                            ...spot,
                            photoUrl: spot.photoUrl || details.photoUrl,
                            coordinates: spot.coordinates?.lat ? spot.coordinates : details.coordinates,
                            rating: spot.rating || details.rating,
                            userRatingCount: spot.userRatingCount || details.userRatingCount,
                            address: spot.address || details.address,
                            // Ensure city/country are set if missing
                            city: (spot.city === "Unknown") ? details.city : spot.city,
                            country: (spot.country === "Unknown") ? details.country : spot.country,
                        };
                    }
                } catch (err) {
                    console.error(`[Enrichment] Failed to enrich spot ${spot.placeId}:`, err.message);
                }
            }
            return spot;
        }));

        const created = await Spot.insertMany(enrichedSpots);

        // Add spot references to user
        await User.findByIdAndUpdate(userId, {
            $push: { spots: { $each: created.map(s => s._id) } },
        });


        res.status(201).json({
            success: true,
            savedCount: created.length,
            spots: created,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/spots/user/:userID — Get user's spots grouped by country → city.
 */
export const getUserSpots = async (req, res, next) => {
    try {
        const { userID } = req.params;
        const spots = await Spot.find({ userId: userID })
            .sort({ country: 1, city: 1, name: 1 })
            .lean();

        // Group by country → city, with a representative city photo
        const grouped = {};
        for (const spot of spots) {
            if (!grouped[spot.country]) {
                grouped[spot.country] = {};
            }
            if (!grouped[spot.country][spot.city]) {
                grouped[spot.country][spot.city] = { spots: [], cityPhoto: null };
            }
            grouped[spot.country][spot.city].spots.push(spot);
        }

        // Pick the best photo per city (highest rating × log10(reviews))
        for (const country of Object.values(grouped)) {
            for (const cityData of Object.values(country)) {
                const withPhotos = cityData.spots
                    .filter(s => s.photoUrl && s.rating && s.userRatingCount)
                    .sort((a, b) => {
                        const scoreA = a.rating * Math.log10(a.userRatingCount || 1);
                        const scoreB = b.rating * Math.log10(b.userRatingCount || 1);
                        return scoreB - scoreA;
                    });
                if (withPhotos.length > 0) {
                    cityData.cityPhoto = withPhotos[0].photoUrl;
                }
            }
        }

        res.status(200).json({
            success: true,
            totalSpots: spots.length,
            grouped,
            spots, // also return flat list for convenience
        });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/spots/:spotID — Delete a single spot.
 */
export const deleteSpot = async (req, res, next) => {
    try {
        const { spotID } = req.params;
        const spot = await Spot.findByIdAndDelete(spotID);
        if (!spot) return res.status(404).json({ error: "Spot not found" });

        // Remove spot reference from user
        await User.findByIdAndUpdate(spot.userId, { $pull: { spots: spot._id } });

        res.status(200).json({ success: true, message: "Spot deleted" });
    } catch (err) {
        next(err);
    }
};
