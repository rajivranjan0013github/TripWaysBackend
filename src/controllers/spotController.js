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
            city: spot.city || spot.country || "Unknown",
            name: spot.name,
            placeId: spot.placeId || spot.id || null,
            address: spot.address || "",
            rating: spot.rating || null,
            userRatingCount: spot.userRatingCount !== undefined ? spot.userRatingCount : null,
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

        // 3. For manual saves (from frontend autocomplete), enrich synchronously
        // so the frontend gets the perfectly truthful data (like capitals) instantly without "Unknown".
        // For video saves (batch), keep it raw for speed and do background enrichment.
        const isManualSave = spotsToSave.length === 1 && spotsToSave[0].source === "manual";
        
        if (isManualSave) {
            const spot = spotsToSave[0];
            if (spot.placeId) {
                const details = await fetchPlaceDetails(spot.placeId);
                if (details) {
                    spot.photoUrl = spot.photoUrl || details.photoUrl || null;
                    spot.coordinates = spot.coordinates?.lat ? spot.coordinates : (details.coordinates || { lat: null, lng: null });
                    spot.rating = spot.rating || details.rating || null;
                    spot.userRatingCount = spot.userRatingCount !== null ? spot.userRatingCount : (details.userRatingCount !== undefined ? details.userRatingCount : null);
                    spot.address = spot.address || details.address || "";
                    
                    // If we swapped a region for its capital
                    if (details.id && details.id !== spot.placeId) {
                        spot.name = details.name;
                        spot.placeId = details.id;
                        spot.city = details.city || details.name;
                        spot.country = details.country;
                        spot.coordinates = details.coordinates;
                    } else {
                        spot.city = (spot.city && spot.city !== "Unknown") ? spot.city : (details.city || details.country || spot.city || spot.country || "Unknown");
                        spot.country = (spot.country && spot.country !== "Unknown") ? spot.country : (details.country || spot.country || "Unknown");
                    }
                }
            }
        }

        // 4. Save to DB (enriched if manual, raw if video)
        const created = await Spot.insertMany(spotsToSave);

        // 5. Link to user
        await User.findByIdAndUpdate(userId, {
            $push: { spots: { $each: created.map(s => s._id) } },
        });

        // 6. Respond immediately with the saved data
        res.status(201).json({
            success: true,
            savedCount: created.length,
            spots: created,
        });

        // 7. Background task: upload photos to R2.
        // If it was a video batch, ALSO do the enrichment in the background.
        setImmediate(async () => {
            for (const spot of created) {
                try {
                    if (!spot.placeId) continue;

                    // If it was already manually enriched, just upload the photo to R2
                    if (isManualSave) {
                        if (spot.photoUrl && !spot.photoUrl.includes('r2.')) {
                            console.log(`[saveSpots] Uploading enriched photo to R2 for ${spot.placeId}...`);
                            const tempSpot = [{ placeId: spot.placeId, photoUrl: spot.photoUrl }];
                            await uploadPlacePhotos(tempSpot);
                            await Spot.findByIdAndUpdate(spot._id, { photoUrl: tempSpot[0].photoUrl });
                        }
                        continue;
                    }

                    // For video batch, do the full background enrichment
                    const isLikelyRegion = spot.name === spot.country || spot.name === spot.city;
                    const needsEnrichment = !spot.photoUrl || !spot.coordinates?.lat || spot.rating === null || isLikelyRegion;
                    if (!needsEnrichment) {
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
                        userRatingCount: spot.userRatingCount !== null ? spot.userRatingCount : (details?.userRatingCount !== undefined ? details.userRatingCount : null),
                        address: spot.address || details.address || "",
                        city: (spot.city && spot.city !== "Unknown") ? spot.city : (details.city || details.country || spot.city || spot.country || "Unknown"),
                        country: (spot.country && spot.country !== "Unknown") ? spot.country : (details.country || spot.country || "Unknown"),
                    };

                    if (details.id && details.id !== spot.placeId) {
                        updateFields.name = details.name;
                        updateFields.placeId = details.id;
                        updateFields.city = details.city || details.name;
                        updateFields.country = details.country;
                        updateFields.coordinates = details.coordinates;
                    }

                    if (updateFields.photoUrl) {
                        const tempSpot = [{ placeId: spot.placeId, photoUrl: updateFields.photoUrl }];
                        await uploadPlacePhotos(tempSpot);
                        updateFields.photoUrl = tempSpot[0].photoUrl;
                    }

                    await Spot.findByIdAndUpdate(spot._id, updateFields);
                    console.log(`[saveSpots] Background enrichment complete for ${spot.placeId}`);
                } catch (err) {
                    console.error(`[saveSpots] Background task failed for ${spot.placeId}:`, err.message);
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
            .sort({ updatedAt: -1 })
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
