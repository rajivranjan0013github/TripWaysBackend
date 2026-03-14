import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// ── Lazy-initialized R2 client ──────────────────────────────────────
// We use lazy init because ES module imports are hoisted, meaning this
// module may load before dotenv.config() runs in the main entry file.
let _s3Client = null;
let _initialized = false;

function getConfig() {
    return {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucketName: process.env.R2_BUCKET_NAME || "travel",
        publicUrl: (process.env.R2_PUBLIC_URL || "https://travel.thethousandways.com").replace(/\/$/, ""),
    };
}

function getClient() {
    if (_initialized) return _s3Client;
    _initialized = true;

    const cfg = getConfig();
    if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey) {
        console.warn("⚠️  R2 credentials not set — place photos will use Google URLs (may expire)");
        _s3Client = null;
        return null;
    }

    _s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
        },
    });
    return _s3Client;
}

/**
 * Check if an object already exists in R2.
 * @param {string} key - The object key (e.g. "places/ChIJxyz.jpg")
 * @returns {Promise<boolean>}
 */
async function objectExists(key) {
    const client = getClient();
    if (!client) return false;
    try {
        await client.send(new HeadObjectCommand({ Bucket: getConfig().bucketName, Key: key }));
        return true;
    } catch {
        return false;
    }
}

/**
 * In-memory cache: placeId → R2 public URL.
 * Avoids repeated HeadObjectCommand network calls for the same photo.
 */
const _r2UrlCache = new Map();

/**
 * Download an image from a Google Places photo URL and upload it to Cloudflare R2.
 * Returns the permanent public R2 URL, or null on failure.
 *
 * @param {string} googlePhotoUrl - The Google Places photo URL
 * @param {string} placeId        - Google place_id (used as filename)
 * @returns {Promise<string|null>} The permanent R2 public URL, or null
 */
export async function uploadPlacePhoto(googlePhotoUrl, placeId) {
    const client = getClient();
    if (!client || !googlePhotoUrl || !placeId) return null;

    // Check in-memory cache first (zero latency)
    if (_r2UrlCache.has(placeId)) {
        return _r2UrlCache.get(placeId);
    }

    const cfg = getConfig();
    const key = `places/${placeId}.jpg`;

    try {
        // Skip upload if the image already exists in R2 (dedup)
        const exists = await objectExists(key);
        if (exists) {
            const publicUrl = `${cfg.publicUrl}/${key}`;
            _r2UrlCache.set(placeId, publicUrl);
            return publicUrl;
        }

        // Download the image from Google
        const response = await fetch(googlePhotoUrl, { redirect: "follow" });
        if (!response.ok) {
            console.warn(`⚠️  Failed to download photo for ${placeId}: HTTP ${response.status}`);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") || "image/jpeg";

        // Upload to R2
        await client.send(
            new PutObjectCommand({
                Bucket: cfg.bucketName,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            })
        );

        const publicUrl = `${cfg.publicUrl}/${key}`;
        _r2UrlCache.set(placeId, publicUrl);
        return publicUrl;
    } catch (err) {
        console.warn(`⚠️  R2 upload failed for ${placeId}:`, err.message);
        return null;
    }
}

/**
 * Process an array of place objects — upload each photo to R2 and
 * replace `photoUrl` with the permanent R2 URL.
 * Falls back to the original Google URL if upload fails.
 *
 * @param {Object[]} places - Array of place objects with { id, photoUrl, ... }
 * @returns {Promise<Object[]>} The same array with updated photoUrl values
 */
export async function uploadPlacePhotos(places) {
    const client = getClient();
    if (!client || !Array.isArray(places) || places.length === 0) return places;


    await Promise.allSettled(
        places.map(async (place) => {
            const placeId = place.id || place.placeId;
            if (!place.photoUrl || !placeId) return;

            const r2Url = await uploadPlacePhoto(place.photoUrl, placeId);
            if (r2Url) {
                place.photoUrl = r2Url;
            }
        })
    );

    return places;
}
