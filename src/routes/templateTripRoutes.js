import { Router } from "express";
import { getTemplateTrips, getTemplateTrip } from "../controllers/templateTripController.js";

const router = Router();

// GET /api/template-trips — List all active template trips
router.get("/", getTemplateTrips);

// GET /api/template-trips/:id — Get full template trip detail
router.get("/:id", getTemplateTrip);

export default router;
