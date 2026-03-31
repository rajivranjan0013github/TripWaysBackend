import mongoose from "mongoose";
import dotenv from "dotenv";
import { uploadThumbnailFromUrl } from "./src/services/r2Service.js";
import { getVideoMetadata } from "./src/services/videoDownloader.js";
import ImportedVideo from "./src/models/ImportedVideo.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env");
  process.exit(1);
}

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);

    // Find imports that are NOT on R2 yet (doesn't contain thethousandways.com)
    const imports = await ImportedVideo.find({
      $or: [
        { thumbnailUrl: { $not: /thethousandways\.com/ } },
        { thumbnailUrl: null }
      ]
    });


    let successCount = 0;
    let failCount = 0;

    for (const item of imports) {
      const urlToRefresh = item.originalUrl || item.normalizedUrl;
      if (!urlToRefresh) {
        console.warn(`⏩ Skipping ${item._id} - No original URL found.`);
        continue;
      }

      
      try {
        // Step 1: Fetch fresh metadata from the platform (Instagram/TikTok/etc)
        const metadata = await getVideoMetadata(urlToRefresh);
        const freshThumbnailUrl = metadata?.thumbnailUrl;

        if (!freshThumbnailUrl) {
          console.warn(`   ⚠️  Could not fetch fresh thumbnail for ${item._id} (Video might be deleted)`);
          failCount++;
          continue;
        }


        // Step 2: Upload the fresh thumbnail to R2
        const r2Url = await uploadThumbnailFromUrl(freshThumbnailUrl, item._id.toString());
        
        if (r2Url) {
          item.thumbnailUrl = r2Url;
          // While we are at it, update other metadata if missing
          if (!item.platform) item.platform = metadata.platform;
          if (!item.title && metadata.title) item.title = metadata.title;
          
          await item.save();
          successCount++;
        } else {
          console.warn(`   ⚠️  Failed to upload fresh thumbnail to R2 for ${item._id}`);
          failCount++;
        }
      } catch (err) {
        console.error(`   ❌ Error processing ${item._id}:`, err.message);
        failCount++;
      }
    }

 

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
