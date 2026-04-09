import config from "../config/apiConfig.js";
import { uploadPlacePhotos } from "./r2Service.js";
import { normalizeCountryName } from "../utils/countryNormalizer.js";

// ── Places API (v1) endpoints ──
const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const MAX_RESULTS_PER_INTEREST = 8;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// Standard field mask for text search — controls billing & response shape
const TEXT_SEARCH_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.types",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.location",
    "places.photos",
    "places.editorialSummary",
    "places.googleMapsUri",
    "places.addressComponents",
].join(",");

// Detailed field mask for a single place lookup
const PLACE_DETAIL_FIELD_MASK = [
    "id",
    "displayName",
    "formattedAddress",
    "rating",
    "userRatingCount",
    "location",
    "photos",
    "editorialSummary",
    "types",
    "primaryTypeDisplayName",
    "currentOpeningHours",
    "addressComponents",
].join(",");


/**
 * Build a v1 photo URL from a photo resource name.
 * @param {string} photoName - e.g. "places/xxx/photos/yyy"
 * @param {number} maxWidth
 * @returns {string} URL
 */
function buildPhotoUrl(photoName, maxWidth = 400) {
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${config.googleMapsApiKey}`;
}

/**
 * Map a v1 place object to our internal shape.
 */
function mapPlace(p, interest, extraFields = {}) {
    const photoUrl =
        p.photos && p.photos.length > 0
            ? buildPhotoUrl(p.photos[0].name, 400)
            : null;

    const mapped = {
        id: p.id,
        name: p.displayName?.text || "Unknown",
        address: p.formattedAddress || "",
        rating: p.rating || null,
        userRatingCount: p.userRatingCount ?? null,
        types: p.types || [],
        primaryType: p.primaryType || null,
        primaryTypeDisplayName: p.primaryTypeDisplayName?.text || null,
        coordinates: p.location
            ? { lat: p.location.latitude, lng: p.location.longitude }
            : null,
        googleMapsUri: p.googleMapsUri || null,
        editorialSummary: p.editorialSummary?.text || null,
        photoUrl,
        interest,
        ...extraFields,
    };

    // If addressComponents are present, extract city and country
    if (p.addressComponents) {
        const addr = p.addressComponents;
        const countryComp = addr.find(c => c.types?.includes("country"));
        const cityComp = addr.find(c => c.types?.includes("locality") || c.types?.includes("administrative_area_level_1"));

        if (countryComp) mapped.country = normalizeCountryName(countryComp.longText);
        if (cityComp) {
            mapped.city = cityComp.longText;
        } else if (countryComp) {
            mapped.city = countryComp.longText;
        }
    }

    return mapped;
}

/**
 * Search for places matching a single interest in a destination
 * using the Places API (v1) Text Search.
 *
 * Includes exponential backoff for transient errors.
 *
 * @param {string} destination - e.g. "Manali, India"
 * @param {string} interest - e.g. "adventure"
 * @param {number} limit - Maximum number of results to take for this interest
 * @returns {Promise<Object[]>} Array of place objects
 */
async function searchPlacesForInterest(destination, interest, limit) {
    const textQuery = `best ${interest} places to visit in ${destination}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(TEXT_SEARCH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": config.googleMapsApiKey,
                    "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
                },
                body: JSON.stringify({
                    textQuery,
                    maxResultCount: 20, // request more, filter down
                }),
            });

            const data = await response.json();

            if (data.places && data.places.length > 0) {
                let places = data.places;

                // Filter for quality: must have rating >= 4.0 and at least 20 reviews
                places = places.filter(
                    (p) =>
                        p.rating &&
                        p.rating >= 4.0 &&
                        p.userRatingCount &&
                        p.userRatingCount >= 20
                );

                // Sort by quality score: rating * log10(userRatingCount)
                places.sort((a, b) => {
                    const scoreA =
                        a.rating * Math.log10(a.userRatingCount);
                    const scoreB =
                        b.rating * Math.log10(b.userRatingCount);
                    return scoreB - scoreA;
                });

                // Take only top N results per interest
                places = places.slice(0, limit);

                return places.map((p) => mapPlace(p, interest));
            }

            // Empty results
            if (data.places && data.places.length === 0) {
                console.warn(
                    `⚠️  No results for "${interest}" in "${destination}"`
                );
                return [];
            }

            // Error response from v1
            if (data.error) {
                const code = data.error.code;
                const msg = data.error.message || "Unknown error";

                // Non-retryable errors
                if ([400, 403, 404].includes(code)) {
                    console.warn(
                        `⚠️  Places API error for "${interest}": ${code} — ${msg}`
                    );
                    return [];
                }

                // 429 (rate limit) or 5xx — worth retrying
                console.warn(
                    `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${interest}": ${code} — ${msg}`
                );
            }
        } catch (err) {
            console.warn(
                `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${interest}" threw: ${err.message}`
            );
        }

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES) {
            await new Promise((r) =>
                setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1))
            );
        }
    }

    console.warn(
        `❌ Places API failed for "${interest}" after ${MAX_RETRIES} attempts`
    );
    return [];
}

/**
 * Discover places in a destination matching a list of interests.
 * Uses the Google Places API (v1) Text Search.
 *
 * @param {string} destination - Destination name (e.g. "Manali")
 * @param {string[]} interests - Array of interest strings
 * @param {number} days - Number of days in the trip, used to restrict daily quantities
 * @returns {Promise<Object[]>} Deduplicated array of discovered places
 */
export async function discoverPlaces(destination, interests, days = 3, excludeIds = []) {
   

    const isSingleInterest = interests.length === 1;

    // Parallelize interest searches with staggered starts (100ms apart)
    // to avoid slamming Google with simultaneous requests
    const promises = interests.map((interest, i) => {
        return new Promise((resolve) => {
            setTimeout(async () => {
                let limit = MAX_RESULTS_PER_INTEREST;
                if (!isSingleInterest) {
                    if (interest === "food")
                        limit = Math.min(days * 2, MAX_RESULTS_PER_INTEREST);
                    else if (interest === "shopping")
                        limit = Math.min(days * 1, MAX_RESULTS_PER_INTEREST);
                }
                resolve(
                    await searchPlacesForInterest(destination, interest, limit)
                );
            }, i * 100);
        });
    });

    const results = await Promise.all(promises);

    // Flatten, deduplicate by place id, and exclude already-existing spots
    const excludeSet = new Set(excludeIds);
    const seenIds = new Set();
    const allPlaces = [];

    for (const batch of results) {
        for (const place of batch) {
            if (!seenIds.has(place.id) && !excludeSet.has(place.id)) {
                seenIds.add(place.id);
                allPlaces.push(place);
            }
        }
    }

  

    // Fire-and-forget: upload to R2 in background (don't block the response)
    uploadPlacePhotos(allPlaces).catch((err) =>
        console.warn(
            "⚠️ Background R2 upload failed (discover):",
            err.message
        )
    );

    return allPlaces;
}

/**
 * Look up a single spot by name in its city context.
 * Returns a place object or null if not found.
 */
async function lookupSingleSpot(spotName, city, country) {
    const textQuery = `${spotName} in ${city}, ${country}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(TEXT_SEARCH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": config.googleMapsApiKey,
                    "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
                },
                body: JSON.stringify({
                    textQuery,
                    maxResultCount: 1,
                }),
            });

            const data = await response.json();

            if (data.places && data.places.length > 0) {
                return mapPlace(data.places[0], "video", { country: normalizeCountryName(country), city });
            }

            if (data.places && data.places.length === 0) {
                console.warn(`⚠️  No results for "${spotName}"`);
                return null;
            }

            if (data.error) {
                const code = data.error.code;
                if ([400, 403, 404].includes(code)) {
                    console.warn(
                        `⚠️  No results for "${spotName}": ${data.error.message}`
                    );
                    return null;
                }
                console.warn(
                    `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${spotName}": ${code}`
                );
            }
        } catch (err) {
            console.warn(
                `⚠️  Places API attempt ${attempt}/${MAX_RETRIES} for "${spotName}" threw: ${err.message}`
            );
        }

        if (attempt < MAX_RETRIES) {
            await new Promise((r) =>
                setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1))
            );
        }
    }

    console.warn(
        `❌ Places API failed for "${spotName}" after ${MAX_RETRIES} attempts`
    );
    return null;
}

const BATCH_SIZE = 10;

/**
 * Look up places extracted from a video, grouped by location (country/city).
 * Searches each spot in its correct city context for accurate results.
 * Uses batched concurrency (10 at a time) for speed, with per-batch R2 uploads.
 *
 * @param {Object[]} locations - Array of { country, city, spots: string[] } from Gemini
 * @param {function} [onProgress] - Optional callback for SSE progress updates
 * @param {function} [onBatchReady] - Optional callback for streaming batches
 * @returns {Promise<Object[]>} Array of place objects with country/city fields
 */
export async function lookupPlacesByLocations(
    locations,
    onProgress,
    onBatchReady
) {
    const totalSpots = locations.reduce(
        (sum, loc) => sum + (loc.spots?.length || 0),
        0
    );
    const lookupStart = Date.now();

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
    const r2UploadPromises = [];

    // Process in parallel batches of 10
    for (let i = 0; i < allSpotTasks.length; i += BATCH_SIZE) {
        const batch = allSpotTasks.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allSpotTasks.length / BATCH_SIZE);

        if (onProgress) {
            onProgress(
                `Looking up places (batch ${batchNum}/${totalBatches})...`
            );
        }

        const batchResults = await Promise.allSettled(
            batch.map(({ spotName, city, country }) =>
                lookupSingleSpot(spotName, city, country)
            )
        );

        const batchPlaces = [];

        for (const result of batchResults) {
            completed++;
            if (result.status === "fulfilled" && result.value) {
                const place = result.value;
                if (!seenIds.has(place.id)) {
                    seenIds.add(place.id);
                    allPlaces.push(place);
                    batchPlaces.push(place);
                }
            }
        }

        // Stream this batch's resolved places to the caller immediately
        if (batchPlaces.length > 0 && onBatchReady) {
            onBatchReady(batchPlaces, allPlaces.length, totalSpots);
        }

        // Pipeline: start R2 upload for this batch's photos immediately (don't wait)
        if (batchPlaces.length > 0) {
            r2UploadPromises.push(
                uploadPlacePhotos(batchPlaces).catch((err) =>
                    console.warn(
                        "⚠️ Background R2 upload failed (video batch):",
                        err.message
                    )
                )
            );
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < allSpotTasks.length) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }

   
    const lookupElapsed = ((Date.now() - lookupStart) / 1000).toFixed(1);

    return allPlaces;
}

/**
 * Fetch full Google Place details (v1) for a given placeId.
 * Used for backend enrichment when saving a spot.
 *
 * @param {string} placeId
 * @returns {Promise<Object|null>}
 */
export async function fetchPlaceDetails(placeId) {
    if (!placeId) return null;

    try {
        const url = `https://places.googleapis.com/v1/places/${placeId}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-Goog-Api-Key": config.googleMapsApiKey,
                "X-Goog-FieldMask": PLACE_DETAIL_FIELD_MASK,
            },
        });

        const r = await response.json();
        if (r.error) {
            console.error(`[placesService] API Error:`, JSON.stringify(r.error, null, 2));
        }
        if (!r.displayName) {
            console.warn(`[placesService] No displayName in response for ${placeId}`);
            return null;
        }

        let targetPlace = r;

        // If the place is an entire country or state, find its capital/major city
        if (targetPlace.types && (targetPlace.types.includes("country") || targetPlace.types.includes("administrative_area_level_1") || targetPlace.types.includes("continent"))) {
            const regionName = targetPlace.displayName?.text || targetPlace.formattedAddress;
            
            try {
                const capitalQuery = `capital of ${regionName}`;
                const searchRes = await fetch(TEXT_SEARCH_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": config.googleMapsApiKey,
                        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
                    },
                    body: JSON.stringify({
                        textQuery: capitalQuery,
                        maxResultCount: 1,
                    }),
                });
                const searchData = await searchRes.json();
                if (searchData.places && searchData.places.length > 0) {
                    targetPlace = searchData.places[0];
                }
            } catch (searchErr) {
                console.warn(`[placesService] Failed to find capital for ${regionName}: ${searchErr.message}`);
            }
        }

        // Map to our internal shape
        return mapPlace(targetPlace, "manual");
    } catch (err) {
        console.error(`❌ Error fetching place details for ${placeId}:`, err.message);
        return null;
    }
}

