import { generateDayWisePlan, extractPlacesFromVideoAI } from "../services/geminiService.js";
import { geocodeItinerary } from "../services/geocodingService.js";
import { getRoutesForItinerary } from "../services/routingService.js";
import { discoverPlaces as discoverPlacesService, lookupPlacesByLocations } from "../services/placesService.js";

/**
 * Helper to enrich candidate places with discovery results if needed.
 */
async function enrichCandidatePlaces(place, days, interests, currentPlaces) {
    const minRequired = Math.min(days * 4, 30); // Aim for at least 4-5 spots per day
    if (currentPlaces.length >= minRequired && currentPlaces.length > 5) return currentPlaces;

    console.log(`🔍 [Enrichment] Only ${currentPlaces.length} spots for ${days} days. Fetching more...`);
    
    try {
        const interestsTouse = interests.length > 0 ? interests : ["popular"];
        const discovered = await discoverPlacesService(place, interestsTouse, days);
        const seenIds = new Set(currentPlaces.map(p => p.id || p.placeId));
        const newPlaces = discovered.filter(p => !seenIds.has(p.id));
        
        console.log(`✅ [Enrichment] Added ${newPlaces.length} new spots from Places API.`);
        return [...currentPlaces, ...newPlaces];
    } catch (err) {
        console.warn("⚠️ [Enrichment] Failed to fetch supplementary places:", err.message);
        return currentPlaces;
    }
}

/**
 * Main trip planning controller.
 * Orchestrates: Input Validation → Gemini → Geocoding → Routing → Response
 */
export async function planTrip(req, res) {
    const startTime = Date.now();

    try {
        // ── Step 1: Validate Input ──────────────────────────────
        const { place, days, interests, discoveredPlaces } = req.body;

        if (!place || typeof place !== "string" || place.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'place'. Provide a destination name.",
            });
        }

        if (!days || typeof days !== "number" || days < 1 || days > 14) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'days'. Provide a number between 1 and 14.",
            });
        }

        const validInterests = Array.isArray(interests) ? interests : [];
        const validDiscoveredPlaces = Array.isArray(discoveredPlaces) ? discoveredPlaces : [];

        console.log(`\n${"═".repeat(50)}`);
        console.log(`📍 Planning trip to "${place}" for ${days} day(s)`);
        if (validInterests.length > 0) {
            console.log(`🎯 Interests: ${validInterests.join(", ")}`);
        }
        if (validDiscoveredPlaces.length > 0) {
            console.log(`📌 Pre-discovered places provided: ${validDiscoveredPlaces.length}`);
        }
        console.log(`${"═".repeat(50)}\n`);

        // ── Step 2: Enrich Candidate Places ─────────────────────
        const enrichedPlaces = await enrichCandidatePlaces(place.trim(), days, validInterests, validDiscoveredPlaces);

        // ── Step 3: Generate Day-Wise Plan via Gemini ───────────
        const plan = await generateDayWisePlan(place.trim(), days, validInterests, enrichedPlaces);

        // ── Step 4: Geocode All Places ──────────────────────────
        const geocodedPlan = await geocodeItinerary(plan);

        // ── Step 5: Get Routes for Each Day ─────────────────────
        const routedPlan = await getRoutesForItinerary(geocodedPlan);

        // ── Step 6: Return Final Response ───────────────────────
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✨ Trip planned in ${elapsedSeconds}s\n`);

        return res.json({
            success: true,
            destination: routedPlan.destination,
            totalDays: routedPlan.totalDays,
            processingTimeSeconds: parseFloat(elapsedSeconds),
            itinerary: routedPlan.itinerary,
        });
    } catch (error) {
        console.error("❌ Trip planning failed:", error.message);

        return res.status(500).json({
            success: false,
            error: "Failed to plan trip. Please try again.",
            details: error.message,
        });
    }
}

/**
 * Main trip planning controller for streaming (Server-Sent Events).
 * Streams: AI Plan → Geocoded Plan → Routed Plan
 */
export async function planTripStream(req, res) {
    const startTime = Date.now();

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Helper to send SSE messages
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // ── Step 1: Validate Input ──────────────────────────────
        const { place, days, interests, discoveredPlaces } = req.body;

        if (!place || typeof place !== "string" || place.trim().length === 0) {
            sendEvent("error", { message: "Missing or invalid 'place'. Provide a destination name." });
            return res.end();
        }

        if (!days || typeof days !== "number" || days < 1 || days > 14) {
            sendEvent("error", { message: "Missing or invalid 'days'. Provide a number between 1 and 14." });
            return res.end();
        }

        const validInterests = Array.isArray(interests) ? interests : [];
        const validDiscoveredPlaces = Array.isArray(discoveredPlaces) ? discoveredPlaces : [];


        console.log(`\n${"═".repeat(50)}`);
        console.log(`📍 Streaming trip pattern to "${place}" for ${days} day(s)`);
        if (validDiscoveredPlaces.length > 0) {
            console.log(`📌 Pre-discovered places provided: ${validDiscoveredPlaces.length}`);
        }
        console.log(`${"═".repeat(50)}\n`);

        // ── Step 2: Enrich Candidate Places ─────────────────────
        const enrichedPlaces = await enrichCandidatePlaces(place.trim(), days, validInterests, validDiscoveredPlaces);

        // ── Step 3: Generate Day-Wise Plan via Gemini ───────────
        const plan = await generateDayWisePlan(place.trim(), days, validInterests, enrichedPlaces);

        // ** STREAM EVENT 1: Basic Itinerary (Text only, feeling of speed!)
        sendEvent("itinerary", {
            destination: plan.destination,
            totalDays: plan.totalDays,
            itinerary: plan.itinerary
        });

        // ── Step 4: Geocode All Places ──────────────────────────
        const geocodedPlan = await geocodeItinerary(plan);

        // ** STREAM EVENT 2: Geocoded Itinerary (Map pins appear!)
        sendEvent("geocoded", {
            itinerary: geocodedPlan.itinerary
        });

        // ── Step 5: Get Routes for Each Day ─────────────────────
        const routedPlan = await getRoutesForItinerary(geocodedPlan);

        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✨ Stream finished in ${elapsedSeconds}s\n`);

        // ** STREAM EVENT 3: Routed Itinerary (Lines appear, final status)
        sendEvent("routed", {
            itinerary: routedPlan.itinerary,
            processingTimeSeconds: parseFloat(elapsedSeconds)
        });

        // End stream naturally
        sendEvent("done", { message: "Stream complete" });
        return res.end();

    } catch (error) {
        console.error("❌ Streaming failed:", error.message);
        sendEvent("error", { message: "Failed to plan trip.", details: error.message });
        return res.end();
    }
}

/**
 * Extract places from a Video URL and look them up via Places API.
 * Streams progress via SSE, then returns discovered places (same shape as /api/discover-places).
 */
export async function extractVideoPlaces(req, res) {
    const startTime = Date.now();

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Helper to send SSE messages
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // ── Step 1: Validate Input ──────────────────────────────
        const { videoUrl } = req.body;

        if (!videoUrl || typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
            sendEvent("error", { message: "Missing or invalid 'videoUrl'. Provide a valid URL." });
            return res.end();
        }

        console.log(`\n${"═".repeat(50)}`);
        console.log(`🎬 Extracting places from VIDEO URL`);
        console.log(`🔗 URL: ${videoUrl}`);
        console.log(`${"═".repeat(50)}\n`);

        // ── Step 2: Extract place names from video via Gemini ──
        let phaseStart = Date.now();
        const aiResult = await extractPlacesFromVideoAI(videoUrl.trim(), (statusMessage) => {
            sendEvent("progress", { message: statusMessage });
        });
        const aiExtractionTime = ((Date.now() - phaseStart) / 1000).toFixed(1);
        console.log(`⏱️ [extractVideoPlaces] AI extraction: ${aiExtractionTime}s`);

        sendEvent("progress", { message: `Extracted places from ${aiResult.locations.length} location(s). Looking up details...` });

        // ── Step 3: Look up each place via Google Places API (per-city) ──
        //    Stream each batch of resolved places to the frontend immediately
        phaseStart = Date.now();
        const places = await lookupPlacesByLocations(
            aiResult.locations,
            (progressMsg) => {
                sendEvent("progress", { message: progressMsg });
            },
            (batchPlaces, totalFound, totalExpected) => {
                sendEvent("place_batch", {
                    places: batchPlaces,
                    totalFound,
                    totalExpected,
                });
            }
        );
        const placesLookupTime = ((Date.now() - phaseStart) / 1000).toFixed(1);
        console.log(`⏱️ [extractVideoPlaces] Places API lookup: ${placesLookupTime}s`);

        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n📊 ═══ extractVideoPlaces TIMING BREAKDOWN ═══`);
        console.log(`   🤖 AI Extraction (download+upload+process+infer): ${aiExtractionTime}s`);
        console.log(`   🔍 Places API Lookup:                             ${placesLookupTime}s`);
        console.log(`   ⏱️  TOTAL:                                         ${elapsedSeconds}s`);
        console.log(`═══════════════════════════════════════════════════\n`);

        // Build the primary destination name from locations
        const destination = aiResult.locations.map(l => l.city).join(", ");

        // ── Step 4: Return places with country/city metadata ──
        sendEvent("places", {
            destination,
            locations: aiResult.locations,
            totalPlaces: places.length,
            places,
            videoTranscript: aiResult.videoTranscript,
            aiUnderstanding: aiResult.aiUnderstanding,
            processingTimeSeconds: parseFloat(elapsedSeconds),
        });

        sendEvent("done", { message: "Stream complete" });
        return res.end();

    } catch (error) {
        console.error("❌ Video place extraction failed:", error.message);
        sendEvent("error", { message: "Failed to extract places from video.", details: error.message });
        return res.end();
    }
}

/**
 * Discover places using Google Places API (no LLM).
 * Takes a destination + interests and returns real place data.
 */
export async function discoverPlaces(req, res) {
    try {
        const { place, interests, days = 3 } = req.body;

        if (!place || typeof place !== "string" || place.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'place'. Provide a destination name.",
            });
        }

        if (!Array.isArray(interests) || interests.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'interests'. Provide at least one interest.",
            });
        }

        console.log(`\n${"═".repeat(50)}`);
        console.log(`🔍 Discovering places in "${place}" via Places API`);
        console.log(`🎯 Interests: ${interests.join(", ")}`);
        console.log(`⏱️ Days: ${days}`);
        console.log(`${"═".repeat(50)}\n`);

        const places = await discoverPlacesService(place.trim(), interests, days);

        return res.json({
            success: true,
            destination: place.trim(),
            totalPlaces: places.length,
            places,
        });
    } catch (error) {
        console.error("❌ Discover places failed:", error.message);

        return res.status(500).json({
            success: false,
            error: "Failed to discover places. Please try again.",
            details: error.message,
        });
    }
}
