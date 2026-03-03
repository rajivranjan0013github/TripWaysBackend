import { Router } from "express";
import { planTrip, planTripStream, planTripStreamFromVideo, discoverPlaces } from "../controllers/tripController.js";

const router = Router();

// POST /api/plan — Plan a trip (Synchronous)
router.post("/plan", planTrip);

// POST /api/plan-stream - Plan a trip (Server-Sent Events streaming)
router.post("/plan-stream", planTripStream);

// POST /api/plan-stream-video - Plan a trip from a Video URL (Server-Sent Events streaming)
router.post("/plan-stream-video", planTripStreamFromVideo);

// POST /api/discover-places - Discover places via Google Places API (no LLM)
router.post("/discover-places", discoverPlaces);

// GET /api/config - Returns API keys needed by frontend
router.get("/config", (req, res) => {
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

export default router;
