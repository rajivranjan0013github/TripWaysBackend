import User from "../models/User.js";

// Optional: You can set a custom authorization header in the RevenueCat dashboard
// and verify it here to ensure the request is actually from RevenueCat.
const REVENUECAT_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH || "";

export const handleRevenueCatWebhook = async (req, res) => {
    try {
        // 1. (Optional) Verify Authorization Header
        if (REVENUECAT_WEBHOOK_AUTH && req.headers.authorization !== `Bearer ${REVENUECAT_WEBHOOK_AUTH}`) {
            console.warn("Unauthorized RevenueCat webhook attempt.");
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { event } = req.body;
        if (!event) {
            return res.status(400).json({ message: "No event payload found" });
        }

        const {
            type,
            app_user_id,
            original_app_user_id,
            product_id,
            expiration_at_ms,
            entitlement_ids,
        } = event;


        // We use app_user_id to identify the user because we set Purchases.logIn(user._id) on the frontend.
        // If app_user_id is an anonymous RevenueCat ID (e.g., $RCAnonymousID:...), we should ideally also check original_app_user_id.
        let userQuery = {};
        
        // Check if the app_user_id is a valid MongoDB ObjectId
        if (app_user_id && app_user_id.length === 24) {
             userQuery = { _id: app_user_id };
        } else {
             // Fallback: Check if we have stored the original_app_user_id previously, or if email was used.
             // If your app was sending emails as the ID, you would check { email: app_user_id }
             userQuery = { $or: [{ rcOriginalAppUserId: original_app_user_id }, { rcOriginalAppUserId: app_user_id }] };
        }

        const user = await User.findOne(userQuery);

        if (!user && (app_user_id.length === 24 || app_user_id.includes('@'))) {
            // If we couldn't find the user but the ID looks like a real ID/Email, try one more time
            // just to be robust. 
            const fallbackUser = await User.findOne({ 
                $or: [
                    { _id: app_user_id.length === 24 ? app_user_id : null },
                    { email: app_user_id }
                ]
            });

            if (fallbackUser) {
                user = fallbackUser;
            }
        }

        if (!user) {
            return res.status(200).json({ message: "User not found, but webhook received successfully." });
        }

        // Save the original RC ID if we haven't already, for future cross-referencing
        if (!user.rcOriginalAppUserId && original_app_user_id) {
            user.rcOriginalAppUserId = original_app_user_id;
        }

        // Safely parse expiration date
        let expiresAt = null;
        if (expiration_at_ms) {
            expiresAt = new Date(Number(expiration_at_ms));
        }

        // 2. Handle Event Types
        switch (type) {
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'NON_RENEWING_PURCHASE':
                // User bought or renewed a subscription
                user.isPremium = true;
                user.premiumPlan = product_id;
                user.premiumExpiresAt = expiresAt;
                
                // If it's a lifetime purchase, there might not be an expiration date
                if (!expiresAt && product_id && product_id.toLowerCase().includes('life')) {
                    // Set to a very far future date or leave as null but isPremium = true
                    // Let's leave expiresAt as null to signify "forever"
                }

                break;

            case 'CANCELLATION':
                // A cancellation means auto-renew is off, but they still have access until expiration.
                // We don't remove premium status yet, RevenueCat will send an EXPIRATION event when the time comes.
                break;

            case 'EXPIRATION':
            case 'BILLING_ISSUE':
                // Subscription has expired or failed to bill. Revoke premium access.
                user.isPremium = false;
                user.premiumPlan = null;
                user.premiumExpiresAt = null;
                break;
                
            case 'TEST':
                break;

            default:
                break;
        }

        await user.save();
        return res.status(200).json({ message: "Webhook processed successfully." });

    } catch (error) {
        console.error("[RevenueCat] Webhook processing error:", error);
        // Return 200 even on error to prevent RC from endlessly retrying if it's our code failure,
        // or return 500 if you *want* RC to retry. Usually, 500 is better for transient db errors.
        return res.status(500).json({ message: "Internal server error processing webhook." });
    }
};
