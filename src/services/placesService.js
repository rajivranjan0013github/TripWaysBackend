import config from "../config/apiConfig.js";
import { uploadPlacePhotos } from "./r2Service.js";

const TEXT_SEARCH_URL =
    "https://maps.googleapis.com/maps/api/place/textsearch/json";

const MAX_RESULTS_PER_INTEREST = 8;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Search for places matching a single interest in a destination
 * using the legacy Places Text Search API.
 * 
 * Includes exponential backoff for OVER_QUERY_LIMIT.
 *
 * @param {string} destination - e.g. "Manali, India"
 * @param {string} interest - e.g. "adventure"
 * @param {number} limit - Maximum number of results to take for this interest
 * @returns {Promise<Object[]>} Array of place objects
 */
async function searchPlacesForInterest(destination, interest, limit) {
    const query = `best ${interest} places to visit in ${destination}`;
    const url = `${TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&key=${config.googleMapsApiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === "OK") {
                let places = data.results || [];

                // Filter for quality: must have rating >= 4.0 and at least 20 reviews
                places = places.filter(p => p.rating && p.rating >= 4.0 && p.user_ratings_total && p.user_ratings_total >= 20);

                // Sort by quality score: rating * log10(user_ratings_total)
                places.sort((a, b) => {
                    const scoreA = a.rating * Math.log10(a.user_ratings_total);
                    const scoreB = b.rating * Math.log10(b.user_ratings_total);
                    return scoreB - scoreA;
                });

                // Take only top N results per interest
                places = places.slice(0, limit);

                return places.map((p) => ({
                    id: p.place_id,
                    name: p.name || "Unknown",
                    address: p.formatted_address || "",
                    rating: p.rating || null,
                    userRatingCount: p.user_ratings_total || 0,
                    types: p.types || [],
                    primaryType: p.types?.[0] || null,
                    coordinates: p.geometry?.location ? {
                        lat: p.geometry.location.lat,
                        lng: p.geometry.location.lng
                    } : null,
                    googleMapsUri: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
                    editorialSummary: null, // not available in legacy API
                    photoUrl: p.photos && p.photos.length > 0
                        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${config.googleMapsApiKey}`
                        : null,
                    interest, // tag which interest sourced this
                }));
            }

            // Non-retryable
            if (["ZERO_RESULTS", "INVALID_REQUEST", "REQUEST_DENIED"].includes(data.status)) {
                console.warn(
                    `⚠️  Places API error for "${interest}": ${data.status} — ${data.error_message || "no results"}`
                );
                return [];
            }

            // OVER_QUERY_LIMIT or UNKNOWN_ERROR — worth retrying
            console.warn(
                `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${interest}": ${data.status}`
            );
        } catch (err) {
            console.warn(
                `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${interest}" threw: ${err.message}`
            );
        }

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    console.warn(`❌ Places API failed for "${interest}" after ${MAX_RETRIES} attempts`);
    return [];
}

/**
 * Discover places in a destination matching a list of interests.
 * Uses the Google Places Text Search API — no LLM involved.
 *
 * @param {string} destination - Destination name (e.g. "Manali")
 * @param {string[]} interests - Array of interest strings
 * @param {number} days - Number of days in the trip, used to restrict daily quantities
 * @returns {Promise<Object[]>} Deduplicated array of discovered places
 */
export async function discoverPlaces(destination, interests, days = 3) {
    console.log(`🔍 Discovering places in "${destination}" for interests: ${interests.join(", ")}`);

    const isSingleInterest = interests.length === 1;

    // Parallelize interest searches with staggered starts (100ms apart)
    // to avoid slamming Google with simultaneous requests
    const promises = interests.map((interest, i) => {
        return new Promise(resolve => {
            setTimeout(async () => {
                let limit = MAX_RESULTS_PER_INTEREST;
                if (!isSingleInterest) {
                    if (interest === 'food') limit = Math.min(days * 2, MAX_RESULTS_PER_INTEREST);
                    else if (interest === 'shopping') limit = Math.min(days * 1, MAX_RESULTS_PER_INTEREST);
                }
                resolve(await searchPlacesForInterest(destination, interest, limit));
            }, i * 100);
        });
    });

    const results = await Promise.all(promises);

    // Flatten and deduplicate by place id
    const seenIds = new Set();
    const allPlaces = [];

    for (const batch of results) {
        for (const place of batch) {
            if (!seenIds.has(place.id)) {
                seenIds.add(place.id);
                allPlaces.push(place);
            }
        }
    }

    console.log(`✅ Discovered ${allPlaces.length} unique places across ${interests.length} interest(s)`);

    // Fire-and-forget: upload to R2 in background (don't block the response)
    uploadPlacePhotos(allPlaces).catch(err =>
        console.warn('⚠️ Background R2 upload failed (discover):', err.message)
    );

    return allPlaces;
}

/**
 * Look up a single spot by name in its city context.
 * Returns a place object or null if not found.
 */
async function lookupSingleSpot(spotName, city, country) {
    const query = `${spotName} in ${city}, ${country}`;
    const url = `${TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&key=${config.googleMapsApiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === "OK" && data.results && data.results.length > 0) {
                const p = data.results[0];
                return {
                    id: p.place_id,
                    name: p.name || spotName,
                    address: p.formatted_address || "",
                    rating: p.rating || null,
                    userRatingCount: p.user_ratings_total || 0,
                    types: p.types || [],
                    primaryType: p.types?.[0] || null,
                    coordinates: p.geometry?.location ? {
                        lat: p.geometry.location.lat,
                        lng: p.geometry.location.lng
                    } : null,
                    googleMapsUri: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
                    editorialSummary: null,
                    photoUrl: p.photos && p.photos.length > 0
                        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${config.googleMapsApiKey}`
                        : null,
                    interest: "video",
                    country,
                    city,
                };
            }

            if (["ZERO_RESULTS", "INVALID_REQUEST", "REQUEST_DENIED"].includes(data.status)) {
                console.warn(`⚠️  No results for "${spotName}": ${data.status}`);
                return null;
            }

            console.warn(`⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${spotName}": ${data.status}`);
        } catch (err) {
            console.warn(`⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${spotName}" threw: ${err.message}`);
        }

        if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    console.warn(`❌ Places API failed for "${spotName}" after ${MAX_RETRIES} attempts`);
    return null;
}

const BATCH_SIZE = 5;

/**
 * Look up places extracted from a video, grouped by location (country/city).
 * Searches each spot in its correct city context for accurate results.
 * Uses batched concurrency (5 at a time) for speed.
 *
 * @param {Object[]} locations - Array of { country, city, spots: string[] } from Gemini
 * @param {function} [onProgress] - Optional callback for SSE progress updates
 * @returns {Promise<Object[]>} Array of place objects with country/city fields
 */
export async function lookupPlacesByLocations(locations, onProgress) {
    const totalSpots = locations.reduce((sum, loc) => sum + (loc.spots?.length || 0), 0);
    console.log(`🔍 Looking up ${totalSpots} places across ${locations.length} location(s) via Places API`);

    // Flatten all spots into a single list with their location context
    const allSpotTasks = [];
    for (const location of locations) {
        const { country, city, spots } = location;
        if (!Array.isArray(spots)) continue;
        for (const spotName of spots) {
            allSpotTasks.push({ spotName, city, country });
        }
    }

    const seenIds = new Set();
    const allPlaces = [];
    let completed = 0;

    // Process in parallel batches
    for (let i = 0; i < allSpotTasks.length; i += BATCH_SIZE) {
        const batch = allSpotTasks.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allSpotTasks.length / BATCH_SIZE);

        if (onProgress) {
            onProgress(`Looking up places (batch ${batchNum}/${totalBatches})...`);
        }

        const batchResults = await Promise.allSettled(
            batch.map(({ spotName, city, country }) => lookupSingleSpot(spotName, city, country))
        );

        for (const result of batchResults) {
            completed++;
            if (result.status === 'fulfilled' && result.value) {
                const place = result.value;
                if (!seenIds.has(place.id)) {
                    seenIds.add(place.id);
                    allPlaces.push(place);
                }
            }
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < allSpotTasks.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    console.log(`✅ Found ${allPlaces.length}/${totalSpots} places via Places API`);

    // Fire-and-forget: upload to R2 in background (don't block the response)
    uploadPlacePhotos(allPlaces).catch(err =>
        console.warn('⚠️ Background R2 upload failed (video):', err.message)
    );

    return allPlaces;
}


