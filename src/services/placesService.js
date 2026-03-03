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

    const results = [];
    const isSingleInterest = interests.length === 1;

    // Search sequentially or with a slight delay to avoid Immediate OVER_QUERY_LIMIT
    for (const interest of interests) {
        let limit = MAX_RESULTS_PER_INTEREST; // Default 8

        // If 'food' or 'shopping' are selected ALONGSIDE other interests, restrict their volume.
        // If they are the ONLY interest chosen, don't restrict them (give the user what they asked for!)
        if (!isSingleInterest) {
            if (interest === 'food') {
                limit = Math.min(days * 2, MAX_RESULTS_PER_INTEREST);
            } else if (interest === 'shopping') {
                limit = Math.min(days * 1, MAX_RESULTS_PER_INTEREST);
            }
        }

        const placesForInterest = await searchPlacesForInterest(destination, interest, limit);
        results.push(placesForInterest);

        // Add a tiny delay between requests if there are more remaining
        if (interest !== interests[interests.length - 1]) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

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

    // Upload place photos to Cloudflare R2 for permanent storage
    await uploadPlacePhotos(allPlaces);

    return allPlaces;
}
