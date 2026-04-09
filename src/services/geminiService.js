import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { cleanupDownloadedVideo, cleanupDownloadedFiles, downloadVideo, downloadVideoWithMetadata, downloadMediaWithMetadata, getVideoMetadata } from "./videoDownloader.js";
import config from "../config/apiConfig.js";
import ImportedVideo from "../models/ImportedVideo.js";

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


  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      thinkingConfig:{
        thinkingBudget:0
      }
    },
  });

  const responseText = response.text;

  try {
    const plan = JSON.parse(responseText);

    // Basic validation
    if (!plan.itinerary || !Array.isArray(plan.itinerary)) {
      throw new Error("Gemini response missing 'itinerary' array");
    }

  

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
 * Uses inline base64 for videos ≤20MB (skips upload + processing), falls back to File API for larger files.
 *
 * @param {string} videoUrl - A public URL to a video (e.g. YouTube, Instagram Reel)
 * @param {number} days - Number of trip days
 * @param {function} onProgress - Callback function to stream status updates
 * @returns {Promise<Object>} Day-wise itinerary with places
 */
export async function generatePlanFromVideo(videoUrl, days, onProgress = () => { }) {
  let localVideoPath = null;
  let uploadResult = null;
  const totalStart = Date.now();
  const timings = {};
  const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

  try {
    // 1. Download the Video
    onProgress("Downloading video from URL...");
    let phaseStart = Date.now();
    localVideoPath = await downloadVideo(videoUrl);
    timings.download = ((Date.now() - phaseStart) / 1000).toFixed(1);

    // 2. Check file size to decide: inline base64 vs File Upload API
    const fileStat = await fsp.stat(localVideoPath);
    const fileSizeBytes = fileStat.size;
    const useInline = fileSizeBytes <= INLINE_SIZE_LIMIT;


    let videoPart;

    if (useInline) {
      // ⚡ FAST PATH: Read as base64, skip upload + processing entirely
      onProgress("Preparing video for AI analysis...");
      phaseStart = Date.now();
      const videoBuffer = await fsp.readFile(localVideoPath);
      const base64Data = videoBuffer.toString("base64");
      videoPart = {
        inlineData: {
          data: base64Data,
          mimeType: "video/mp4"
        }
      };
      timings.upload = "skipped";
      timings.processing = "skipped";
    } else {
      // 🐌 FALLBACK: Large file → use File Upload API + poll for processing
      onProgress("Uploading video to AI for analysis...");
      phaseStart = Date.now();
      uploadResult = await ai.files.upload({
        file: localVideoPath,
        mimeType: "video/mp4"
      });
      timings.upload = ((Date.now() - phaseStart) / 1000).toFixed(1);


      // Wait for PROCESSING to finish
      onProgress("Processing video chunks (this takes a few seconds)...");
      phaseStart = Date.now();
      let fileState = uploadResult.state;
      let pollDelay = 1500;
      while (fileState === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, pollDelay));
        pollDelay = Math.min(pollDelay * 1.5, 5000);
        const checkResult = await ai.files.get({ name: uploadResult.name });
        fileState = checkResult.state;
        if (fileState === 'FAILED') {
          throw new Error("Gemini failed to process the uploaded video.");
        }
      }

      timings.processing = ((Date.now() - phaseStart) / 1000).toFixed(1);

      videoPart = {
        fileData: {
          fileUri: uploadResult.uri,
          mimeType: uploadResult.mimeType
        }
      };
    }

    // 3. Prompt Gemini with the uploaded file
    onProgress("🎬 AI is watching the video and extracting places...");
    phaseStart = Date.now();
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


    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        videoPart,
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

    timings.geminiInference = ((Date.now() - phaseStart) / 1000).toFixed(1);
    timings.total = ((Date.now() - totalStart) / 1000).toFixed(1);

   
    return plan;

  } catch (error) {
    console.error("❌ generatePlanFromVideo failed:", error);
    throw error;
  } finally {
    // Cleanup Resources
    onProgress("Cleaning up temporary files...");

    // Delete Gemini File (only if we used the File Upload path)
    if (uploadResult && uploadResult.name) {
      try {
        await ai.files.delete({ name: uploadResult.name });
      } catch (e) { console.error("Could not delete Gemini file", e); }
    }
  }
}

/**
 * Extract place names and destination from a video URL using Gemini.
 * Does NOT generate an itinerary — only extracts raw place data for further lookup.
 *
 * ⚡ CACHE: Checks if a completed ImportedVideo with the same sourceVideoId exists.
 *    If found, returns the cached AI extraction + resolved places instantly.
 *
 * Uses inline base64 for videos ≤20MB (skips upload + processing), falls back to File API for larger files.
 *
 * @param {string} videoUrl - A public URL to a video (e.g. YouTube, Instagram Reel)
 * @param {function} onProgress - Callback function to stream status updates
 * @returns {Promise<Object>} { destination, places: string[], videoTranscript, aiUnderstanding }
 */
export async function extractPlacesFromVideoAI(videoUrl, onProgress = () => { }, options = {}) {
  let localVideoPath = null;
  let carouselPaths = [];
  let uploadResult = null;
  let extractionSucceeded = false;
  const totalStart = Date.now();
  const timings = {};
  const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB
  let videoMetadata = null;
  let mediaType = "video"; // "video" or "carousel"

  try {
    // ── CACHE CHECK: Quick metadata fetch to get sourceVideoId ──
    onProgress("Checking if this video was already analyzed...");
    let quickMeta = null;
    try {
      quickMeta = await getVideoMetadata(videoUrl);
    } catch {
      // Non-fatal — proceed without cache
    }

    if (quickMeta?.sourceVideoId) {
      // Look for a completed import with the same sourceVideoId (global cache)
      const cachedImport = await ImportedVideo.findOne({
        sourceVideoId: quickMeta.sourceVideoId,
        status: "completed",
        locations: { $exists: true, $ne: [] },
      }).lean();

      if (cachedImport) {

        return {
          locations: cachedImport.locations || [],
          mediaType: cachedImport.mediaType || "video",
          title: cachedImport.title || quickMeta.title || "",
          caption: cachedImport.caption || quickMeta.caption || "",
          videoTranscript: cachedImport.aiTranscript || "",
          aiUnderstanding: cachedImport.aiUnderstanding || "",
          normalizedUrl: cachedImport.normalizedUrl || quickMeta.normalizedUrl || videoUrl,
          sourceVideoId: quickMeta.sourceVideoId,
          thumbnailUrl: cachedImport.thumbnailUrl || quickMeta.thumbnailUrl || null,
          platform: cachedImport.platform || quickMeta.platform || "other",
          localVideoPath: null,
          localCarouselPaths: null,
          // Cache-specific fields
          _cached: true,
          _cachedImportId: cachedImport._id,
          _cachedResolvedPlaces: cachedImport.resolvedPlaces || [],
          _cachedCloudflareVideoUrl: cachedImport.cloudflareVideoUrl || null,
          _cachedCloudflareAssetKey: cachedImport.cloudflareAssetKey || null,
        };
      }

    }

    // ── No cache hit — proceed with full download + extraction ──

    // 1. Smart download: auto-detects video vs image carousel
    onProgress("Downloading media...");
    let phaseStart = Date.now();
    const dlResult = await downloadMediaWithMetadata(videoUrl, {
      importId: options.importId || null,
      userId: options.userId || null,
    });
    videoMetadata = dlResult.metadata;
    mediaType = dlResult.type; // "video" or "carousel"
    timings.downloadAndMeta = ((Date.now() - phaseStart) / 1000).toFixed(1);

    let mediaParts = [];

    if (mediaType === "carousel") {
      // ─── CAROUSEL PATH: Send all images to Gemini as inline data parts ───
      carouselPaths = dlResult.filePaths;
      onProgress(`📸 Found ${carouselPaths.length} carousel image(s). Preparing for AI...`);
      phaseStart = Date.now();

      // Parallelize media reading + encoding (handles both images AND video files in mixed carousels)
      mediaParts = await Promise.all(carouselPaths.map(async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
          ".mp4": "video/mp4", ".mov": "video/quicktime",
        };
        const mimeType = mimeMap[ext] || "image/jpeg";

        const fileBuffer = await fsp.readFile(filePath);
        return {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType,
          },
        };
      }));

      // Use the first image as the thumbnail
      if (!videoMetadata.thumbnailUrl && carouselPaths.length > 0) {
        videoMetadata.thumbnailUrl = carouselPaths[0]; // local path, will be uploaded to R2 later
      }

      timings.encode = ((Date.now() - phaseStart) / 1000).toFixed(1);
      timings.upload = "skipped";
      timings.processing = "skipped";

    } else {
      // ─── VIDEO PATH: Existing logic ───
      localVideoPath = dlResult.filePath;
      const fileStat = await fsp.stat(localVideoPath);
      const fileSizeBytes = fileStat.size;
      const useInline = fileSizeBytes <= INLINE_SIZE_LIMIT;

      if (useInline) {
        onProgress("Preparing video for AI analysis...");
        phaseStart = Date.now();
        const videoBuffer = await fsp.readFile(localVideoPath);
        mediaParts.push({
          inlineData: {
            data: videoBuffer.toString("base64"),
            mimeType: "video/mp4",
          },
        });
        timings.encode = ((Date.now() - phaseStart) / 1000).toFixed(1);
        timings.upload = "skipped";
        timings.processing = "skipped";
      } else {
        onProgress("Uploading video to AI for analysis...");
        phaseStart = Date.now();
        uploadResult = await ai.files.upload({
          file: localVideoPath,
          mimeType: "video/mp4",
        });
        timings.upload = ((Date.now() - phaseStart) / 1000).toFixed(1);

        onProgress("Processing video chunks (this takes a few seconds)...");
        phaseStart = Date.now();
        let fileState = uploadResult.state;
        let pollDelay = 1500;
        while (fileState === "PROCESSING") {
          await new Promise((resolve) => setTimeout(resolve, pollDelay));
          pollDelay = Math.min(pollDelay * 1.5, 5000);
          const checkResult = await ai.files.get({ name: uploadResult.name });
          fileState = checkResult.state;
          if (fileState === "FAILED") {
            throw new Error("Gemini failed to process the uploaded video.");
          }
        }
        timings.processing = ((Date.now() - phaseStart) / 1000).toFixed(1);

        mediaParts.push({
          fileData: {
            fileUri: uploadResult.uri,
            mimeType: uploadResult.mimeType,
          },
        });
      }
    }

    // 3. Prompt Gemini to extract places grouped by country and city
    const mediaLabel = mediaType === "carousel" ? "images" : "video";
    onProgress(`🎬 AI is analyzing the ${mediaLabel} and extracting places...`);
    phaseStart = Date.now();
    const prompt = `You are an expert travel analyst and ${mediaType === "carousel" ? "image" : "video"} reviewer.
    ${mediaType === "carousel" ? "Look at all the attached images carefully. These are from an Instagram carousel post." : "Watch the attached video carefully."}

    Your task is to extract travel-related information from ${mediaType === "carousel" ? "these images" : "this video"}. DO NOT create an itinerary. Only extract raw data.

    1. Identify ALL countries and cities/regions featured in the ${mediaLabel}.
    2. For each city, extract ALL specific places, tourist spots, restaurants, cafés, landmarks, hotels, or experiences mentioned or visually shown.
    3. Determine the overall "vibe" or theme of the ${mediaLabel} (e.g., adventure, food tour, relaxing getaway, cultural exploration).
    4. Write a detailed ${mediaType === "carousel" ? "description/summary of what is shown in the images" : "transcript/summary of what happens in the video"}.

    Rules:
    - Group places by their COUNTRY and CITY/REGION.
    - Extract as many specific, real place names as possible.
    - Use the official/commonly known name for each place (e.g., "Eiffel Tower" not "that big tower").
    - If a place is shown but not named, try to identify it from visual cues.
    - Only include places that actually exist and can be found on Google Maps.
    - Use proper, full, commonly-used English country names consistently (e.g., "United Kingdom" not "UK" or "England", "United States" not "USA" or "US", "South Korea" not "Korea", "United Arab Emirates" not "UAE", "Netherlands" not "Holland", "Czechia" not "Czech Republic").
    - Do NOT generate an itinerary or day-wise plan.

    Respond with ONLY valid JSON in this exact structure:
    {
      "title": "Best-effort title",
      "caption": "Best-effort caption or description from the post",
      "aiUnderstanding": "A concise summary of the vibe and why these places matter",
      "videoTranscript": "A detailed ${mediaType === "carousel" ? "description of what the images show" : "transcript or narration summary of what happens in the video"}",
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
    }`;


    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...mediaParts,
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig:{
          thinkingBudget:0
        }
      },
    });

    const responseText = response.text;
    const result = JSON.parse(responseText);

    if (!Array.isArray(result.locations) || result.locations.length === 0) {
      throw new Error("Gemini response missing 'locations' array");
    }

    const totalSpots = result.locations.reduce((sum, loc) => sum + (loc.spots?.length || 0), 0);
    timings.geminiInference = ((Date.now() - phaseStart) / 1000).toFixed(1);
    timings.total = ((Date.now() - totalStart) / 1000).toFixed(1);

    extractionSucceeded = true;

    return {
      ...result,
      mediaType,
      title: result.title || videoMetadata?.title || "",
      caption: result.caption || videoMetadata?.caption || "",
      videoTranscript: result.videoTranscript || "",
      aiUnderstanding: result.aiUnderstanding || "",
      normalizedUrl: videoMetadata?.normalizedUrl || videoUrl,
      sourceVideoId: videoMetadata?.sourceVideoId || null,
      thumbnailUrl: videoMetadata?.thumbnailUrl || null,
      platform: videoMetadata?.platform || "other",
      localVideoPath: (options.keepLocalFile && mediaType === "video") ? localVideoPath : null,
      localCarouselPaths: (options.keepLocalFile && mediaType === "carousel") ? carouselPaths : null,
      _cached: false,
    };

  } catch (error) {
    console.error("❌ extractPlacesFromVideoAI failed:", error);
    throw error;
  } finally {
    onProgress("Cleaning up temporary files...");

    // Delete Gemini File (only if we used the File Upload path)
    if (uploadResult && uploadResult.name) {
      try {
        await ai.files.delete({ name: uploadResult.name });
      } catch (e) { console.error("Could not delete Gemini file", e); }
    }

    if (!options.keepLocalFile || !extractionSucceeded) {
      await cleanupDownloadedVideo(localVideoPath);
      await cleanupDownloadedFiles(carouselPaths);
    }
  }
}
