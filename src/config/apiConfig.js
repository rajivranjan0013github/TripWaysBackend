import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  port: process.env.PORT || 3001,
};

// Validate required keys on startup
if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
  console.error("❌ GEMINI_API_KEY is missing or not set in .env");
  process.exit(1);
}

if (
  !config.googleMapsApiKey ||
  config.googleMapsApiKey === "your_google_maps_api_key_here"
) {
  console.error("❌ GOOGLE_MAPS_API_KEY is missing or not set in .env");
  process.exit(1);
}

export default config;
