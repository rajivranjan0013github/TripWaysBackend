import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { downloadVideo } from "./videoDownloader.js";
import config from "../config/apiConfig.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * Generate a day-wise travel itinerary using Gemini AI.
 *
 * @param {string} place - The destination (e.g., "Manali")
 * @param {number} days - Number of trip days
 * @param {string[]} interests - User interests (e.g., ["adventure", "temples"])
 * @param {Object[]} discoveredPlaces - Optional array of places directly from the Discover Places API. 
 *                                      If provided, the AI should arrange these places.
 * @returns {Promise<Object>} Day-wise itinerary with places
 */
export async function generateDayWisePlan(place, days, interests = [], discoveredPlaces = []) {
  const interestsText =
    interests.length > 0
      ? `The traveler is especially interested in: ${interests.join(", ")}.`
      : "Include a good mix of sightseeing, culture, food, and nature.";

  let placesInstruction = "";
  if (discoveredPlaces && discoveredPlaces.length > 0) {
    placesInstruction = `
I have already retrieved the exact coordinates for the places to visit. YOU MUST USE THESE EXACT PLACES AND THEIR EXACT COORDINATES. Include the coordinates object back in the JSON output exactly as I provided it to you.
Do not invent your own places. Create the itinerary using solely the places listed below (you can pick a subset if ${days} days is too short, or use them all). Combine them geographically into day clusters.

AVAILABLE PLACES:
${JSON.stringify(discoveredPlaces, null, 2)}
`;
  }

  const prompt = `You are an expert travel planner. Create a detailed ${days}-day travel itinerary for "${place}".

${interestsText}
${placesInstruction}

Rules:
- Suggest 3 to 5 places per day.
- **GEOGRAPHIC CLUSTERING (CRITICAL)**: Each day MUST cover one tight geographic zone or neighborhood. All places on the same day should be within a small radius so the traveler never crosses the same road twice. Divide the destination into distinct geographic zones (e.g., north, south, old town, waterfront) and assign each zone to a different day. Days must NOT overlap geographically — if Day 1 covers the north side, Day 2 must NOT include any places from the north side.
- **WITHIN-DAY ORDERING**: After clustering, order the places within each day by best time of day (morning activities first, afternoon in the middle, evening/night activities last). If two places have the same best time, put the geographically closer one first to avoid backtracking.
- **NO BACKTRACKING**: The route within a single day should flow in one geographic direction (e.g., west to east, or clockwise around a zone). Never go A → B → A direction.
- Give each day a short descriptive theme (e.g., "Adventure & Valleys", "Culture & Heritage").
- For each place, estimate how many hours a visitor would typically spend there.
- Include the best time of day to visit each place (morning, afternoon, or evening).
${discoveredPlaces && discoveredPlaces.length > 0 ? "- Make sure the coordinates of the place are preserved in the final JSON output." : ""}

Respond with ONLY valid JSON in this exact structure:
{
  "destination": "${place}",
  "totalDays": ${days},
  "itinerary": [
    {
      "day": 1,
      "theme": "Theme for Day 1",
      "places": [
        {
          "name": "Exact Place Name",
          "description": "Brief 1-2 sentence description of the place",
          "category": "one of: adventure, nature, culture, food, shopping, sightseeing, leisure, spiritual",
          "estimatedTimeHours": 2.5,
          "bestTimeOfDay": "morning"${discoveredPlaces && discoveredPlaces.length > 0 ? ",\n          \"coordinates\": { \"lat\": 0.0, \"lng\": 0.0 }" : ""}
        }
      ]
    }
  ]
}`;

  console.log("🤖 Calling Gemini for day-wise itinerary...");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const responseText = response.text;

  try {
    const plan = JSON.parse(responseText);

    // Basic validation
    if (!plan.itinerary || !Array.isArray(plan.itinerary)) {
      throw new Error("Gemini response missing 'itinerary' array");
    }

    console.log(
      `✅ Gemini generated ${plan.itinerary.length}-day plan with ${plan.itinerary.reduce((sum, day) => sum + day.places.length, 0)} total places`
    );

    return plan;
  } catch (parseError) {
    console.error("❌ Failed to parse Gemini response:", responseText);
    throw new Error(`Gemini returned invalid JSON: ${parseError.message}`);
  }
}

/**
 * Generate a day-wise travel itinerary by extracting info from a Video URL.
 * Prompts Gemini with a downloaded video file.
 *
 * @param {string} videoUrl - A public URL to a video (e.g. YouTube, Instagram Reel)
 * @param {number} days - Number of trip days
 * @param {function} onProgress - Callback function to stream status updates
 * @returns {Promise<Object>} Day-wise itinerary with places
 */
export async function generatePlanFromVideo(videoUrl, days, onProgress = () => { }) {
  let localVideoPath = null;
  let uploadResult = null;

  try {
    // 1. Download the Video
    onProgress("Downloading video from URL...");
    localVideoPath = await downloadVideo(videoUrl);

    // 2. Upload to Gemini
    onProgress("Uploading video to AI for analysis...");

    // We upload via the new @google/genai SDK mechanism
    console.log(`☁️ Uploading local file to Gemini: ${localVideoPath}`);
    uploadResult = await ai.files.upload({
      file: localVideoPath,
      mimeType: "video/mp4"
    });

    console.log(`☁️ Uploaded as: ${uploadResult.name}. Current state: ${uploadResult.state}`);

    // 3. Wait for PROCESSING to finish
    // Gemini videos require waiting until the file state is 'ACTIVE'
    onProgress("Processing video chunks (this takes a few seconds)...");

    let fileState = uploadResult.state;
    while (fileState === 'PROCESSING') {
      console.log('⏳ Waiting for video to finish processing on Gemini...');
      // Sleep 3 seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const checkResult = await ai.files.get({ name: uploadResult.name });
      fileState = checkResult.state;

      if (fileState === 'FAILED') {
        throw new Error("Gemini failed to process the uploaded video.");
      }
    }

    console.log(`✅ Video is ${fileState}`);

    // 4. Prompt Gemini with the uploaded file
    onProgress("🎬 AI is watching the video and extracting places...");
    const prompt = `You are an expert travel planner and video analyst.
    Watch the attached video carefully.
  
    1. Figure out the main destination or city featured in the video.
    2. Extract all specific places, tourist spots, restaurants, or experiences mentioned or shown.
    3. Determine the overall "vibe" or theme of the video (e.g., adventure, food tour, relaxing getaway).
    
    Using ONLY the places extracted from the video (and optionally filling in the gaps with logical nearby places if the video doesn't have enough for ${days} days), create a detailed ${days}-day travel itinerary.
  
    Rules:
    - Suggest 3 to 5 places per day.
    - **GEOGRAPHIC CLUSTERING (CRITICAL)**: Each day MUST cover one tight geographic zone or neighborhood. All places on the same day should be within a small radius so the traveler never crosses the same road twice. Divide the destination into distinct geographic zones and assign each zone to a different day. Days must NOT overlap geographically.
    - **WITHIN-DAY ORDERING**: After clustering, order the places within each day by best time of day (morning activities first, afternoon in the middle, evening/night activities last). If two places have the same best time, put the geographically closer one first to avoid backtracking.
    - **NO BACKTRACKING**: The route within a single day should flow in one geographic direction. Never go A → B → A direction.
    - Give each day a short descriptive theme based on the video's vibe.
    - For each place, estimate how many hours a visitor would typically spend there.
    - Include the best time of day to visit each place (morning, afternoon, or evening).
  
    Respond with ONLY valid JSON in this exact structure:
    {
      "destination": "Extracted Destination Name",
      "videoTranscript": "A detailed 2-3 paragraph breakdown of the spoken transcript or the visual events happening in the video.",
      "aiUnderstanding": "A 1-2 sentence summary of your understanding of this video's vibe and why these specific places are recommended.",
      "totalDays": ${days},
      "itinerary": [
        {
          "day": 1,
          "theme": "Theme for Day 1",
          "places": [
            {
              "name": "Exact Place Name",
              "description": "Brief 1-2 sentence description of the place, specifically mentioning how it was featured in the video",
              "category": "one of: adventure, nature, culture, food, shopping, sightseeing, leisure, spiritual",
              "estimatedTimeHours": 2.5,
              "bestTimeOfDay": "morning"
            }
          ]
        }
      ]
    }`;

    console.log(`🤖 Prompting Gemini...`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Pro model is much better at video extraction
      contents: [
        {
          fileData: {
            fileUri: uploadResult.uri,
            mimeType: uploadResult.mimeType
          }
        },
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    const plan = JSON.parse(responseText);

    if (!plan.itinerary || !Array.isArray(plan.itinerary)) {
      throw new Error("Gemini response missing 'itinerary' array");
    }

    console.log(`✅ Gemini generated ${plan.itinerary.length}-day plan for ${plan.destination}`);
    return plan;

  } catch (error) {
    console.error("❌ generatePlanFromVideo failed:", error);
    throw error;
  } finally {
    // 5. Cleanup Resources
    onProgress("Cleaning up temporary files (leaving local file per user request)...");

    // Delete local file - TEMPORARILY DISABLED BY USER REQUEST
    // if (localVideoPath && fs.existsSync(localVideoPath)) {
    //     try {
    //         fs.unlinkSync(localVideoPath);
    //         console.log(`🗑️ Deleted local temp file: ${localVideoPath}`);
    //     } catch(e) { console.error("Could not delete local file", e); }
    // }

    // Delete Gemini File
    if (uploadResult && uploadResult.name) {
      try {
        await ai.files.delete({ name: uploadResult.name });
        console.log(`🗑️ Deleted Gemini storage file: ${uploadResult.name}`);
      } catch (e) { console.error("Could not delete Gemini file", e); }
    }
  }
}

/**
 * Extract place names and destination from a video URL using Gemini.
 * Does NOT generate an itinerary — only extracts raw place data for further lookup.
 *
 * @param {string} videoUrl - A public URL to a video (e.g. YouTube, Instagram Reel)
 * @param {function} onProgress - Callback function to stream status updates
 * @returns {Promise<Object>} { destination, places: string[], videoTranscript, aiUnderstanding }
 */
export async function extractPlacesFromVideoAI(videoUrl, onProgress = () => { }) {
  let localVideoPath = null;
  let uploadResult = null;

  try {
    // 1. Download the Video
    onProgress("Downloading video from URL...");
    localVideoPath = await downloadVideo(videoUrl);

    // 2. Upload to Gemini
    onProgress("Uploading video to AI for analysis...");
    console.log(`☁️ Uploading local file to Gemini: ${localVideoPath}`);
    uploadResult = await ai.files.upload({
      file: localVideoPath,
      mimeType: "video/mp4"
    });

    console.log(`☁️ Uploaded as: ${uploadResult.name}. Current state: ${uploadResult.state}`);

    // 3. Wait for PROCESSING to finish
    onProgress("Processing video chunks (this takes a few seconds)...");
    let fileState = uploadResult.state;
    while (fileState === 'PROCESSING') {
      console.log('⏳ Waiting for video to finish processing on Gemini...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const checkResult = await ai.files.get({ name: uploadResult.name });
      fileState = checkResult.state;
      if (fileState === 'FAILED') {
        throw new Error("Gemini failed to process the uploaded video.");
      }
    }

    console.log(`✅ Video is ${fileState}`);

    // 4. Prompt Gemini to extract places grouped by country and city
    onProgress("🎬 AI is watching the video and extracting places...");
    const prompt = `You are an expert travel analyst and video reviewer.
    Watch the attached video carefully.

    Your task is to extract travel-related information from this video. DO NOT create an itinerary. Only extract raw data.

    1. Identify ALL countries and cities/regions featured in the video.
    2. For each city, extract ALL specific places, tourist spots, restaurants, cafés, landmarks, hotels, or experiences mentioned or visually shown.
    3. Determine the overall "vibe" or theme of the video (e.g., adventure, food tour, relaxing getaway, cultural exploration).
    4. Write a detailed transcript/summary of what happens in the video.

    Rules:
    - Group places by their COUNTRY and CITY/REGION.
    - Extract as many specific, real place names as possible.
    - Use the official/commonly known name for each place (e.g., "Eiffel Tower" not "that big tower").
    - If a place is shown but not named, try to identify it from visual cues.
    - Only include places that actually exist and can be found on Google Maps.
    - Use proper country names (e.g., "France" not "FR").
    - Do NOT generate an itinerary or day-wise plan.

    Respond with ONLY valid JSON in this exact structure:
    {
      "locations": [
        {
          "country": "Country Name",
          "city": "City or Region Name",
          "spots": [
            "Exact Place Name 1",
            "Exact Place Name 2"
          ]
        }
      ],
      "videoTranscript": "A detailed 2-3 paragraph breakdown of the spoken transcript or the visual events happening in the video.",
      "aiUnderstanding": "A 1-2 sentence summary of the video's vibe and what kind of travel experience it showcases."
    }`;

    console.log(`🤖 Prompting Gemini to extract places...`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          fileData: {
            fileUri: uploadResult.uri,
            mimeType: uploadResult.mimeType
          }
        },
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    const result = JSON.parse(responseText);

    if (!Array.isArray(result.locations) || result.locations.length === 0) {
      throw new Error("Gemini response missing 'locations' array");
    }

    const totalSpots = result.locations.reduce((sum, loc) => sum + (loc.spots?.length || 0), 0);
    console.log(`✅ Gemini extracted ${totalSpots} places across ${result.locations.length} location(s)`);
    return result;

  } catch (error) {
    console.error("❌ extractPlacesFromVideoAI failed:", error);
    throw error;
  } finally {
    onProgress("Cleaning up temporary files...");

    // Delete Gemini File
    if (uploadResult && uploadResult.name) {
      try {
        await ai.files.delete({ name: uploadResult.name });
        console.log(`🗑️ Deleted Gemini storage file: ${uploadResult.name}`);
      } catch (e) { console.error("Could not delete Gemini file", e); }
    }
  }
}
