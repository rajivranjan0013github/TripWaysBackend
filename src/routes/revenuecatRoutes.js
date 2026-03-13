import express from "express";
import { handleRevenueCatWebhook } from "../controllers/revenuecatController.js";

const router = express.Router();

// The webhook endpoint inside your backend.
// Note: Do NOT add JWT authentication middleware here. RevenueCat servers will call this,
// not your authenticated client app.
router.post("/webhook", handleRevenueCatWebhook);

export default router;
