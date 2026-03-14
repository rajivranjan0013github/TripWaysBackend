import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import User from "../models/User.js";

const router = Router();

// ─── Client IDs ───────────────────────────────────────────────
const GOOGLE_WEB_CLIENT_ID =
    "600831714498-b4h3pgaf049kjrue5snp21qhh5hqmecr.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID =
    "600831714498-3e2apuej7ojgf568elvibrifo4qn05lu.apps.googleusercontent.com";
const APPLE_BUNDLE_ID = "com.thousandways.travel";

// ─── Apple JWKS client ───────────────────────────────────────
const appleJwksClient = jwksClient({
    jwksUri: "https://appleid.apple.com/auth/keys",
    cache: true,
    cacheMaxAge: 86400000, // 24 hours
});

function getAppleSigningKey(header, callback) {
    appleJwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
        } else {
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
        }
    });
}

// ─── Google login/signup ─────────────────────────────────────
router.post("/google/loginSignUp", async (req, res) => {
    try {
        const { token, platform } = req.body;

        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }

        // Use the appropriate client ID based on platform
        const clientId =
            platform === "android" ? GOOGLE_WEB_CLIENT_ID : GOOGLE_IOS_CLIENT_ID;
        const client = new OAuth2Client(clientId);

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: clientId,
        });

        const payload = ticket.getPayload();

        // Check if user exists
        let user = await User.findOne({ email: payload.email });
        let isNewUser = false;

        if (!user) {
            // Create new user if doesn't exist
            isNewUser = true;
            user = await User.create({
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                authProvider: "google",
                platform: platform === "android" ? "android" : "ios",
            });
        }

        res.json({
            success: true,
            isNewUser,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                picture: user.picture,
            },
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            error: "Invalid token",
        });
    }
});

// ─── Apple login/signup ──────────────────────────────────────
router.post("/apple/loginSignUp", async (req, res) => {
    try {
        const { idToken, displayName, email: providedEmail } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "Identity token is required" });
        }

        // Verify the Apple identity token using JWKS
        const decodedToken = await new Promise((resolve, reject) => {
            jwt.verify(
                idToken,
                getAppleSigningKey,
                {
                    algorithms: ["RS256"],
                    issuer: "https://appleid.apple.com",
                    audience: APPLE_BUNDLE_ID,
                },
                (err, decoded) => {
                    if (err) reject(err);
                    else resolve(decoded);
                }
            );
        });

        const email = decodedToken.email || providedEmail;

        if (!email) {
            return res.status(400).json({
                error: "Email is required. Please try signing in again.",
            });
        }

        // Check if user exists
        let user = await User.findOne({ email });
        let isNewUser = false;

        if (!user) {
            // Create new user if doesn't exist
            isNewUser = true;
            user = await User.create({
                email,
                name: displayName || "Apple User",
                authProvider: "apple",
                platform: "ios",
            });
        }

        res.json({
            success: true,
            isNewUser,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        console.error("Error verifying Apple token:", error.message);
        res.status(401).json({
            success: false,
            error: "Invalid token",
        });
    }
});

export default router;

