import Trip from "../models/Trip.js";
import { uploadPlacePhotos } from "./r2Service.js";

/**
 * Background worker to synchronize R2 photo URLs to a saved Trip in MongoDB.
 * 
 * Flow:
 * 1. Frontend calls /api/trips to save a trip.
 * 2. Backend instantly saves it to MongoDB using the temporary Google photo URLs.
 * 3. Backend fires off this function and returns 200 OK immediately.
 * 4. This worker scans the trip's `discoveredPlaces` and `itinerary`.
 * 5. If it finds any `places.googleapis.com` URLs, it uploads them to R2.
 * 6. Finally, it completely overwrites the trip document with the new R2 links.
 * 
 * @param {string} tripId - The MongoDB ID of the saved trip.
 */
export async function syncTripPhotosToR2(tripId) {
    if (!tripId) return;

    try {
        console.log(`\n⏳ [Sync Worker] Starting background photo sync for Trip ${tripId}...`);
        
        // 1. Fetch the trip directly from DB
        const trip = await Trip.findById(tripId);
        if (!trip) {
            console.warn(`⚠️ [Sync Worker] Trip ${tripId} not found. Aborting.`);
            return;
        }

        let needsUpdate = false;
        
        // 2. Scan and upload `discoveredPlaces`
        if (Array.isArray(trip.discoveredPlaces)) {
            const placesWithGoogleUrls = trip.discoveredPlaces.filter(p => 
                p.photoUrl && p.photoUrl.includes("places.googleapis.com")
            );
            
            if (placesWithGoogleUrls.length > 0) {
                console.log(`[Sync Worker] Found ${placesWithGoogleUrls.length} Google URLs in discoveredPlaces. Syncing...`);
                // This will upload and mutate `photoUrl` in-place
                await uploadPlacePhotos(placesWithGoogleUrls);
                needsUpdate = true;
            }
        }

        // 3. Scan and upload `itinerary`
        if (Array.isArray(trip.itinerary)) {
            const itineraryPlaces = [];
            trip.itinerary.forEach(day => {
                if (Array.isArray(day.places)) {
                    day.places.forEach(p => {
                        if (p.photoUrl && p.photoUrl.includes("places.googleapis.com")) {
                            itineraryPlaces.push(p);
                        }
                    });
                }
            });

            if (itineraryPlaces.length > 0) {
                console.log(`[Sync Worker] Found ${itineraryPlaces.length} Google URLs in itinerary. Syncing...`);
                await uploadPlacePhotos(itineraryPlaces);
                needsUpdate = true;
            }
        }

        // 4. Update the representative picture if needed
        let tripRepPic = trip.tripRepPic;
        if (tripRepPic && tripRepPic.includes("places.googleapis.com")) {
            // Find if one of our newly synced places matches this photo, and use its R2 URL
            const syncedPlace = (trip.discoveredPlaces || []).find(p => p.photoUrl && p.photoUrl.includes("travel.thethousandways.com"));
            if (syncedPlace) {
                tripRepPic = syncedPlace.photoUrl;
                needsUpdate = true;
            }
        }

        // 5. Save the updated document back to MongoDB if anything changed
        if (needsUpdate) {
            await Trip.updateOne(
                { _id: tripId },
                {
                    $set: {
                        discoveredPlaces: trip.discoveredPlaces,
                        itinerary: trip.itinerary,
                        tripRepPic: tripRepPic
                    }
                }
            );
            console.log(`✅ [Sync Worker] Successfully patched Trip ${tripId} with permanent Cloudflare R2 URLs.`);
        } else {
            console.log(`✅ [Sync Worker] Trip ${tripId} is already fully synced (no Google URLs found).`);
        }

    } catch (err) {
        console.error(`❌ [Sync Worker] Failed to sync photos for Trip ${tripId}:`, err);
    }
}
