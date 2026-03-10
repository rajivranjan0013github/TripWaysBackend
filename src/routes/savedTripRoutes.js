import { Router } from "express";
import { saveTrip, getUserTrips, getTrip, deleteTrip, updateTrip } from "../controllers/savedTripController.js";

const router = Router();

// POST /api/trips — Save a generated trip
router.post("/", saveTrip);

// GET /api/trips/user/:userID — List user's trips
router.get("/user/:userID", getUserTrips);

// GET /api/trips/:tripID — Get full trip detail
router.get("/:tripID", getTrip);

// PATCH /api/trips/:tripID — Update a trip (itinerary, etc.)
router.patch("/:tripID", updateTrip);

// DELETE /api/trips/:tripID — Delete a trip
router.delete("/:tripID", deleteTrip);

export default router;
