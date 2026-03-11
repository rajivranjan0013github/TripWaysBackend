import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import config from "./config/apiConfig.js";
import { errorHandler } from "./middleware/errorHandler.js";
import tripRoutes from "./routes/tripRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import savedTripRoutes from "./routes/savedTripRoutes.js";
import spotRoutes from "./routes/spotRoutes.js";
import templateTripRoutes from "./routes/templateTripRoutes.js";

const app = express();

// Middleware
app.use(
    cors({
        origin: "*", // Allow all origins (React Native + web dev servers)
    })
);
app.use(express.json({ limit: "50mb" }));

// Connect to MongoDB
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB");
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err.message);
    });

// Routes
app.use("/api", tripRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/users", userRoutes);
app.use("/api/trips", savedTripRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/template-trips", templateTripRoutes);

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "running",
        message: "Travel Itinerary Planner API",
        endpoints: {
            planTrip: "POST /api/plan",
            planTripStream: "POST /api/plan-stream",
            planTripStreamFromVideo: "POST /api/extract-video-places",
            discoverPlaces: "POST /api/discover-places",
            config: "GET /api/config",
            login: "POST /api/login/google/loginSignUp",
            users: "GET /api/users/:userID",
            trips: "GET /api/trips/user/:userID",
            spots: "GET /api/spots/user/:userID",
            templateTrips: "GET /api/template-trips",
        },
    });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
    console.log(`\n🚀 Travel Backend running on http://localhost:${config.port}`);
    console.log(`📍 Plan a trip: POST http://localhost:${config.port}/api/plan`);

    // Pre-warm Gemini connection (avoids cold-start TCP/TLS overhead on first request)
    import("@google/genai").then(({ GoogleGenAI }) => {
        const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
        ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "hi",
            config: { maxOutputTokens: 5 },
        }).then(() => {
            console.log("✅ Gemini connection pre-warmed");
        }).catch(() => {
            // Silently fail — not critical
        });
    }).catch(() => { });
});
