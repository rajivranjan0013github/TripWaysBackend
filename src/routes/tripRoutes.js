import { Router } from "express";
import { planTrip, planTripStream, extractVideoPlaces, discoverPlaces, optimizeDayRouteController } from "../controllers/tripController.js";

const router = Router();

// POST /api/plan — Plan a trip (Synchronous)
router.post("/plan", planTrip);

// POST /api/plan-stream - Plan a trip (Server-Sent Events streaming)
router.post("/plan-stream", planTripStream);

// POST /api/extract-video-places - Extract places from a Video URL (SSE streaming)
router.post("/extract-video-places", extractVideoPlaces);

// POST /api/discover-places - Discover places via Google Places API (no LLM)
router.post("/discover-places", discoverPlaces);

// POST /api/optimize-day - Optimize a day's spots for shortest route
router.post("/optimize-day", optimizeDayRouteController);

// GET /api/config - Returns API keys needed by frontend
router.get("/config", (req, res) => {
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

export default router;
