import { Router } from "express";
import { sendToToken, sendToTopic } from "../utils/Notification.js";
import User from "../models/User.js";

const router = Router();

/**
 * POST /api/notification/send-notification
 * Send a notification to a topic
 * Body: { topic, title, body, data?, imageUrl? }
 */
router.post("/send-notification", async (req, res) => {
  try {
    const { topic = "all_users", title, body, data, imageUrl } = req.body;
    const resp = await sendToTopic(topic, title, body, data, imageUrl);
    res.status(200).json({ message: "Notification sent successfully", response: resp });
  } catch (error) {
    console.error("Failed to send topic notification:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notification/send-to-token
 * Send a notification to a specific device token or user
 * Body: { token?: string, userId?: string, title, body, data?, imageUrl? }
 */
router.post("/send-to-token", async (req, res) => {
  try {
    const { token, userId, title, body, data, imageUrl } = req.body;

    let fcmToken = token;

    // If userId is provided, look up their FCM token
    if (!fcmToken && userId) {
      const user = await User.findById(userId).select("fcmToken").lean();
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      fcmToken = user.fcmToken;
    }

    if (!fcmToken) {
      return res.status(400).json({ error: "No FCM token provided or user has no token" });
    }

    const resp = await sendToToken(fcmToken, title, body, data || {}, imageUrl);
    res.status(200).json({
      message: "Notification sent successfully",
      response: resp,
    });
  } catch (error) {
    console.error("Failed to send token notification:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
