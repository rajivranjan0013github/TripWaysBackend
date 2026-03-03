import express from "express";
import cors from "cors";
import config from "./config/apiConfig.js";
import tripRoutes from "./routes/tripRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";

const app = express();

// Middleware
app.use(
    cors({
        origin: "*", // Allow all origins (React Native + web dev servers)
    })
);
app.use(express.json());

// Routes
app.use("/api", tripRoutes);
app.use("/api/login", loginRoutes);

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "running",
        message: "Travel Itinerary Planner API",
        endpoints: {
            planTrip: "POST /api/plan",
            planTripStream: "POST /api/plan-stream",
            planTripStreamFromVideo: "POST /api/plan-stream-video",
            discoverPlaces: "POST /api/discover-places",
            config: "GET /api/config",
        },
    });
});

// Start server
app.listen(config.port, () => {
    console.log(`\n🚀 Travel Backend running on http://localhost:${config.port}`);
    console.log(`📍 Plan a trip: POST http://localhost:${config.port}/api/plan`);
    console.log(`\nExample request body:`);
    console.log(
        JSON.stringify(
            { place: "Manali", days: 3, interests: ["adventure", "nature"] },
            null,
            2
        )
    );
});
