import { Router } from "express";
import { saveSpots, getUserSpots, deleteSpot } from "../controllers/spotController.js";

const router = Router();

// POST /api/spots — Save spots (batch)
router.post("/", saveSpots);

// GET /api/spots/user/:userID — Get user's spots (grouped by country/city)
router.get("/user/:userID", getUserSpots);

// DELETE /api/spots/:spotID — Delete a single spot
router.delete("/:spotID", deleteSpot);

export default router;
