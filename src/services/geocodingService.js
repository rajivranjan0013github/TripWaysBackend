import config from "../config/apiConfig.js";

const GEOCODING_BASE_URL =
    "https://maps.googleapis.com/maps/api/geocode/json";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Geocode a single place name to { lat, lng } coordinates.
 *
 * @param {string} placeName - Name of the place
 * @param {string} destination - Parent destination for context (e.g., "Manali, India")
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodePlace(placeName, destination) {
    // Append destination for better accuracy (e.g., "Solang Valley, Manali")
    const address = `${placeName}, ${destination}`;
    const url = `${GEOCODING_BASE_URL}?address=${encodeURIComponent(address)}&key=${config.googleMapsApiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === "OK" && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                return { lat: location.lat, lng: location.lng };
            }

            // Non-retryable statuses — no point retrying
            if (["ZERO_RESULTS", "INVALID_REQUEST"].includes(data.status)) {
                console.warn(
                    `⚠️  Geocoding failed for "${placeName}": ${data.status} — ${data.error_message || "no results"}`
                );
                return null;
            }

            // OVER_QUERY_LIMIT or UNKNOWN_ERROR — worth retrying
            console.warn(
                `⚠️  Geocoding attempt ${attempt}/${MAX_RETRIES} for "${placeName}": ${data.status}`
            );
        } catch (err) {
            console.warn(
                `⚠️  Geocoding attempt ${attempt}/${MAX_RETRIES} for "${placeName}" threw: ${err.message}`
            );
        }

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    console.warn(`❌ Geocoding failed for "${placeName}" after ${MAX_RETRIES} attempts`);
    return null;
}

export async function geocodeItinerary(plan) {
    console.log("🗺️  Geocoding all places concurrently...");

    const destination = plan.destination;

    // Process all days concurrently
    const dayPromises = plan.itinerary.map(async (day) => {
        // Geocode all places within a day in parallel
        const geocodePromises = day.places.map((place) => {
            if (place.coordinates && place.coordinates.lat && place.coordinates.lng) {
                return Promise.resolve(place.coordinates);
            }
            return geocodePlace(place.name, destination);
        });

        const coordinates = await Promise.all(geocodePromises);

        // Attach coordinates to each place
        return {
            ...day,
            places: day.places.map((place, index) => ({
                ...place,
                coordinates: coordinates[index],
            })),
        };
    });

    // Wait for all days to finish
    plan.itinerary = await Promise.all(dayPromises);

    // Count successes
    const totalPlaces = plan.itinerary.reduce(
        (sum, day) => sum + day.places.length,
        0
    );
    const geocodedPlaces = plan.itinerary.reduce(
        (sum, day) =>
            sum + day.places.filter((p) => p.coordinates !== null).length,
        0
    );

    console.log(`✅ Geocoded ${geocodedPlaces}/${totalPlaces} places`);

    return plan;
}
