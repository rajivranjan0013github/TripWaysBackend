import config from "../config/apiConfig.js";

const ROUTES_API_URL =
    "https://routes.googleapis.com/directions/v2:computeRoutes";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Get route for a single day's list of places using Google Routes API.
 *
 * @param {Object[]} places - Array of places with coordinates for one day
 * @returns {Promise<Object|null>} Route info (distance, duration, polyline, legs)
 */
async function getRouteForDay(places) {
    // Filter out places without coordinates
    const validPlaces = places.filter((p) => p.coordinates !== null);

    if (validPlaces.length < 2) {
        // Need at least 2 places to create a route
        return null;
    }

    // Build the request body for Routes API
    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: validPlaces[0].coordinates.lat,
                    longitude: validPlaces[0].coordinates.lng,
                },
            },
        },
        destination: {
            location: {
                latLng: {
                    latitude: validPlaces[validPlaces.length - 1].coordinates.lat,
                    longitude: validPlaces[validPlaces.length - 1].coordinates.lng,
                },
            },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "METRIC",
    };

    // Add intermediate waypoints if there are more than 2 places
    if (validPlaces.length > 2) {
        requestBody.intermediates = validPlaces.slice(1, -1).map((p) => ({
            location: {
                latLng: {
                    latitude: p.coordinates.lat,
                    longitude: p.coordinates.lng,
                },
            },
        }));
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(ROUTES_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": config.googleMapsApiKey,
                    "X-Goog-FieldMask":
                        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation",
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (data.error) {
                // Non-retryable errors (invalid request, not found, etc.)
                if (data.error.code && data.error.code >= 400 && data.error.code < 500 && data.error.code !== 429) {
                    console.warn(
                        `⚠️  Routes API error: ${data.error.message || JSON.stringify(data.error)}`
                    );
                    return null;
                }

                // Rate-limit (429) or server errors (5xx) — retry
                console.warn(
                    `⚠️  Routes API attempt ${attempt}/${MAX_RETRIES}: ${data.error.message || JSON.stringify(data.error)}`
                );
            } else if (!data.routes || data.routes.length === 0) {
                console.warn(`⚠️  Routes API returned no routes (attempt ${attempt}/${MAX_RETRIES})`);
            } else {
                // Success — parse and return
                const route = data.routes[0];

                const totalDurationSeconds = parseInt(route.duration?.replace("s", "") || "0");
                const totalDistanceKm = parseFloat(
                    ((route.distanceMeters || 0) / 1000).toFixed(1)
                );

                const legs = (route.legs || []).map((leg, index) => {
                    const legDurationSeconds = parseInt(leg.duration?.replace("s", "") || "0");
                    return {
                        from: validPlaces[index].name,
                        to: validPlaces[index + 1].name,
                        distanceKm: parseFloat(((leg.distanceMeters || 0) / 1000).toFixed(1)),
                        durationMinutes: Math.round(legDurationSeconds / 60),
                        polyline: leg.polyline?.encodedPolyline || null,
                    };
                });

                return {
                    totalDistanceKm,
                    totalDurationMinutes: Math.round(totalDurationSeconds / 60),
                    polyline: route.polyline?.encodedPolyline || null,
                    legs,
                };
            }
        } catch (err) {
            console.warn(
                `⚠️  Routes API attempt ${attempt}/${MAX_RETRIES} threw: ${err.message}`
            );
        }

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    console.warn(`❌ Routes API failed after ${MAX_RETRIES} attempts`);
    return null;
}

/**
 * Get routes for the entire itinerary (all days).
 * Adds a `route` field to each day.
 *
 * @param {Object} plan - The geocoded itinerary
 * @returns {Promise<Object>} Same plan with routes added
 */
export async function getRoutesForItinerary(plan) {

    // Get routes for all days in parallel
    const routePromises = plan.itinerary.map((day) =>
        getRouteForDay(day.places)
    );

    const routes = await Promise.all(routePromises);

    // Attach routes to each day
    plan.itinerary = plan.itinerary.map((day, index) => ({
        ...day,
        route: routes[index],
    }));

    const routedDays = routes.filter((r) => r !== null).length;
   

    return plan;
}

/**
 * Optimize a single day's spot ordering using Google Routes API.
 * Uses `optimizeWaypointOrder: true` to find the shortest-distance route.
 *
 * @param {Object[]} places - Array of place objects with coordinates ({lat, lng}) and name
 * @returns {Promise<{optimizedPlaces: Object[], route: Object|null}>}
 */
export async function optimizeDayRoute(places) {
    const validPlaces = places.filter(
        (p) => p.coordinates && p.coordinates.lat && p.coordinates.lng
    );

    if (validPlaces.length < 2) {
        return { optimizedPlaces: places, route: null };
    }

    // Build request body — same as getRouteForDay but with optimizeWaypointOrder
    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: validPlaces[0].coordinates.lat,
                    longitude: validPlaces[0].coordinates.lng,
                },
            },
        },
        destination: {
            location: {
                latLng: {
                    latitude: validPlaces[validPlaces.length - 1].coordinates.lat,
                    longitude: validPlaces[validPlaces.length - 1].coordinates.lng,
                },
            },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "METRIC",
    };

    if (validPlaces.length > 2) {
        requestBody.intermediates = validPlaces.slice(1, -1).map((p) => ({
            location: {
                latLng: {
                    latitude: p.coordinates.lat,
                    longitude: p.coordinates.lng,
                },
            },
        }));
        requestBody.optimizeWaypointOrder = true;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(ROUTES_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": config.googleMapsApiKey,
                    "X-Goog-FieldMask":
                        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.optimizedIntermediateWaypointIndex",
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (data.error) {
                if (data.error.code >= 400 && data.error.code < 500 && data.error.code !== 429) {
                    console.warn(`⚠️  Optimize Routes API error: ${data.error.message || JSON.stringify(data.error)}`);
                    return { optimizedPlaces: places, route: null };
                }
                console.warn(`⚠️  Optimize Routes API attempt ${attempt}/${MAX_RETRIES}: ${data.error.message}`);
            } else if (!data.routes || data.routes.length === 0) {
                console.warn(`⚠️  Optimize Routes API returned no routes (attempt ${attempt}/${MAX_RETRIES})`);
            } else {
                const route = data.routes[0];

                // Rebuild the optimized order from the response
                // Google's indices refer to the intermediates we sent, which are validPlaces.slice(1, -1)
                const waypointOrder = route.optimizedIntermediateWaypointIndex;
                let reorderedPlaces;

                if (waypointOrder && waypointOrder.length > 0) {
                    const intermediates = validPlaces.slice(1, -1);
                    const reorderedIntermediates = waypointOrder
                        .map((idx) => intermediates[idx])
                        .filter(Boolean);
                    reorderedPlaces = [
                        validPlaces[0],
                        ...reorderedIntermediates,
                        validPlaces[validPlaces.length - 1],
                    ].filter(Boolean);
                } else {
                    reorderedPlaces = [...validPlaces];
                }

                // Append any places that didn't have coordinates (so they aren't lost)
                const reorderedSet = new Set(reorderedPlaces);
                const remaining = places.filter(p => p && !reorderedSet.has(p));
                reorderedPlaces = [...reorderedPlaces, ...remaining];

                // Build route info (same shape as getRouteForDay)
                const totalDurationSeconds = parseInt(route.duration?.replace("s", "") || "0");
                const totalDistanceKm = parseFloat(((route.distanceMeters || 0) / 1000).toFixed(1));

                const legs = (route.legs || []).map((leg, index) => {
                    const legDurationSeconds = parseInt(leg.duration?.replace("s", "") || "0");
                    return {
                        from: reorderedPlaces[index]?.name || "",
                        to: reorderedPlaces[index + 1]?.name || "",
                        distanceKm: parseFloat(((leg.distanceMeters || 0) / 1000).toFixed(1)),
                        durationMinutes: Math.round(legDurationSeconds / 60),
                        polyline: leg.polyline?.encodedPolyline || null,
                    };
                });

                const routeResult = {
                    totalDistanceKm,
                    totalDurationMinutes: Math.round(totalDurationSeconds / 60),
                    polyline: route.polyline?.encodedPolyline || null,
                    legs,
                };

                return { optimizedPlaces: reorderedPlaces, route: routeResult };
            }
        } catch (err) {
            console.warn(`⚠️  Optimize Routes API attempt ${attempt}/${MAX_RETRIES} threw: ${err.message}`);
        }

        if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    console.warn(`❌ Optimize Routes API failed after ${MAX_RETRIES} attempts`);
    return { optimizedPlaces: places, route: null };
}
