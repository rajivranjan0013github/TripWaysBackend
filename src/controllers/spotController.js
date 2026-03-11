import Spot from "../models/Spot.js";
import User from "../models/User.js";
import { fetchPlaceDetails } from "../services/placesService.js";
import { uploadPlacePhotos } from "../services/r2Service.js";

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

        // 1. Map to internal shape (NO enrichment — save raw data fast)
        const rawSpots = spots.map(spot => ({
            userId,
            country: spot.country || "Unknown",
            city: spot.city || "Unknown",
            name: spot.name,
            placeId: spot.placeId || spot.id || null,
            address: spot.address || "",
            rating: spot.rating || null,
            userRatingCount: spot.userRatingCount || 0,
            photoUrl: spot.photoUrl || spot.image || null,
            coordinates: spot.coordinates || { lat: null, lng: null },
            source: spot.source || "video",
        }));

        // 2. Deduplicate: skip spots already saved by this user
        const placeIds = rawSpots.filter(s => s.placeId).map(s => s.placeId);
        const existingSpots = await Spot.find({
            userId,
            placeId: { $in: placeIds },
        }).lean();
        const existingPlaceIds = new Set(existingSpots.map(s => s.placeId));

        const spotsToSave = rawSpots.filter(s => !s.placeId || !existingPlaceIds.has(s.placeId));

        if (spotsToSave.length === 0) {
            return res.status(200).json({
                success: true,
                message: "All spots already saved",
                savedCount: 0,
                spots: existingSpots,
            });
        }

        // 3. Save to DB immediately (raw data, no enrichment yet)
        const created = await Spot.insertMany(spotsToSave);

        // 4. Link to user
        await User.findByIdAndUpdate(userId, {
            $push: { spots: { $each: created.map(s => s._id) } },
        });

        // 5. Respond immediately — user sees instant save
        res.status(201).json({
            success: true,
            savedCount: created.length,
            spots: created,
        });

        // 6. Background: enrich missing data + upload photos to R2 (non-blocking)
        setImmediate(async () => {
            for (const spot of created) {
                try {
                    if (!spot.placeId) continue;
                    const needsEnrichment = !spot.photoUrl || !spot.coordinates?.lat || spot.rating === null;
                    if (!needsEnrichment) {
                        // Still upload existing photo to R2 for permanence
                        if (spot.photoUrl && !spot.photoUrl.includes('r2.')) {
                            await uploadPlacePhotos([spot]);
                            await Spot.findByIdAndUpdate(spot._id, { photoUrl: spot.photoUrl });
                        }
                        continue;
                    }

                    const details = await fetchPlaceDetails(spot.placeId);
                    if (!details) continue;

                    const updateFields = {
                        photoUrl: spot.photoUrl || details.photoUrl || null,
                        coordinates: spot.coordinates?.lat ? spot.coordinates : (details.coordinates || { lat: null, lng: null }),
                        rating: spot.rating || details.rating || null,
                        userRatingCount: spot.userRatingCount || details.userRatingCount || 0,
                        address: spot.address || details.address || "",
                        // Preserve original city/country from frontend — only fill if 'Unknown'
                        city: (spot.city && spot.city !== "Unknown") ? spot.city : (details.city || spot.city || "Unknown"),
                        country: (spot.country && spot.country !== "Unknown") ? spot.country : (details.country || spot.country || "Unknown"),
                    };

                    // Upload photo to R2 for permanence
                    if (updateFields.photoUrl) {
                        console.log(`[saveSpots] Uploading photo to R2 for ${spot.placeId}: ${updateFields.photoUrl.substring(0, 80)}...`);
                        const tempSpot = [{ placeId: spot.placeId, photoUrl: updateFields.photoUrl }];
                        await uploadPlacePhotos(tempSpot);
                        updateFields.photoUrl = tempSpot[0].photoUrl; // R2 URL after upload
                        console.log(`[saveSpots] R2 URL: ${updateFields.photoUrl?.substring(0, 80)}...`);
                    }

                    await Spot.findByIdAndUpdate(spot._id, updateFields);
                    console.log(`[saveSpots] Background enrichment complete for ${spot.placeId} (city: ${updateFields.city}, country: ${updateFields.country})`);
                } catch (err) {
                    console.error(`[saveSpots] Background enrichment failed for ${spot.placeId}:`, err.message);
                }
            }
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
                    .filter(s => s.photoUrl)
                    .sort((a, b) => {
                        const scoreA = (a.rating || 0) * Math.log10(a.userRatingCount || 1);
                        const scoreB = (b.rating || 0) * Math.log10(b.userRatingCount || 1);
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
