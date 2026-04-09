import express from "express";
import { getDownloadErrors, getDownloadErrorStats } from "../controllers/adminController.js";

const router = express.Router();

// GET /api/admin/download-errors?limit=50&skip=0&errorCode=LOGIN_REQUIRED&platform=instagram&since=2026-04-01
router.get("/download-errors", getDownloadErrors);

// GET /api/admin/download-errors/stats?since=2026-04-01
router.get("/download-errors/stats", getDownloadErrorStats);

export default router;
