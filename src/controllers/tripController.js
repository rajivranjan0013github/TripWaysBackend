import { generateDayWisePlan, generatePlanFromVideo } from "../services/geminiService.js";
import { geocodeItinerary } from "../services/geocodingService.js";
import { getRoutesForItinerary } from "../services/routingService.js";
import { discoverPlaces as discoverPlacesService } from "../services/placesService.js";

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

        // ── Step 2: Generate Day-Wise Plan via Gemini ───────────
        const plan = await generateDayWisePlan(place.trim(), days, validInterests, validDiscoveredPlaces);

        // ── Step 3: Geocode All Places ──────────────────────────
        const geocodedPlan = await geocodeItinerary(plan);

        // ── Step 4: Get Routes for Each Day ─────────────────────
        const routedPlan = await getRoutesForItinerary(geocodedPlan);

        // ── Step 5: Return Final Response ───────────────────────
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

        // ── Step 2: Generate Day-Wise Plan via Gemini ───────────
        const plan = await generateDayWisePlan(place.trim(), days, validInterests, validDiscoveredPlaces);

        // ** STREAM EVENT 1: Basic Itinerary (Text only, feeling of speed!)
        sendEvent("itinerary", {
            destination: plan.destination,
            totalDays: plan.totalDays,
            itinerary: plan.itinerary
        });

        // ── Step 3: Geocode All Places ──────────────────────────
        const geocodedPlan = await geocodeItinerary(plan);

        // ** STREAM EVENT 2: Geocoded Itinerary (Map pins appear!)
        sendEvent("geocoded", {
            itinerary: geocodedPlan.itinerary
        });

        // ── Step 4: Get Routes for Each Day ─────────────────────
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
 * Main trip planning controller for streaming (Server-Sent Events) from a Video URL.
 * Streams: AI Plan → Geocoded Plan → Routed Plan
 */
export async function planTripStreamFromVideo(req, res) {
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
        const { videoUrl, days } = req.body;

        if (!videoUrl || typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
            sendEvent("error", { message: "Missing or invalid 'videoUrl'. Provide a valid URL." });
            return res.end();
        }

        if (!days || typeof days !== "number" || days < 1 || days > 14) {
            sendEvent("error", { message: "Missing or invalid 'days'. Provide a number between 1 and 14." });
            return res.end();
        }

        console.log(`\n${"═".repeat(50)}`);
        console.log(`🎬 Streaming trip pattern from VIDEO URL for ${days} day(s)`);
        console.log(`🔗 URL: ${videoUrl}`);
        console.log(`${"═".repeat(50)}\n`);

        // ── Step 2: Generate Day-Wise Plan via Gemini analysis ──
        // Pass a callback to stream detailed download/upload steps back to UI
        const plan = await generatePlanFromVideo(videoUrl.trim(), days, (statusMessage) => {
            sendEvent("progress", { message: statusMessage });
        });

        // ** STREAM EVENT 1: Basic Itinerary (Text only, feeling of speed!)
        sendEvent("itinerary", {
            destination: plan.destination,
            totalDays: plan.totalDays,
            itinerary: plan.itinerary,
            videoTranscript: plan.videoTranscript,
            aiUnderstanding: plan.aiUnderstanding,
            fromVideo: true
        });

        // ── Step 3: Geocode All Places ──────────────────────────
        const geocodedPlan = await geocodeItinerary(plan);

        // ** STREAM EVENT 2: Geocoded Itinerary (Map pins appear!)
        sendEvent("geocoded", {
            itinerary: geocodedPlan.itinerary
        });

        // ── Step 4: Get Routes for Each Day ─────────────────────
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
        console.error("❌ Video Streaming failed:", error.message);
        sendEvent("error", { message: "Failed to plan trip from video.", details: error.message });
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
