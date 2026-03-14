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

        const event = req.body.event || req.body;
        if (!event || !event.type) {
            return res.status(400).json({ message: "No event payload found" });
        }

        const {
            type,
            app_user_id,
            original_app_user_id,
            aliases,
            product_id,
            expiration_at_ms,
            entitlement_ids,
        } = event;

        console.log(`[RevenueCat] Received event: ${type} for user: ${app_user_id}`);

        // 1. Build a list of all potential IDs for fallback matching
        const idsToTry = Array.from(new Set([
            app_user_id,
            original_app_user_id,
            ...(aliases || [])
        ])).filter(Boolean);

        // 2. Lookup: High priority on email match, fallback to rcOriginalAppUserId
        let user = await User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${app_user_id}$`, 'i') } },
                { rcOriginalAppUserId: { $in: idsToTry } }
            ]
        });

        if (!user) {
            console.log(`[RevenueCat] User not found for identifiers: ${idsToTry.join(', ')}. Event ignored.`);
            return res.status(200).json({ message: "User not found, but webhook received successfully." });
        }

        // 3. Save the original RC ID if we haven't already
        if (!user.rcOriginalAppUserId && original_app_user_id) {
            user.rcOriginalAppUserId = original_app_user_id;
        }

        // 4. Log the event to user history
        user.premiumHistory.push({
            event: type,
            productId: product_id,
            timestamp: event.event_timestamp_ms ? new Date(event.event_timestamp_ms) : new Date(),
            store: event.store || 'UNKNOWN'
        });

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

                console.log(`[RevenueCat] Granted Premium to user ${user._id}. Expires: ${expiresAt}`);
                break;

            case 'CANCELLATION':
                // A cancellation means auto-renew is off, but they still have access until expiration.
                // We don't remove premium status yet, RevenueCat will send an EXPIRATION event when the time comes.
                console.log(`[RevenueCat] User ${user._id} cancelled auto-renew for ${product_id}.`);
                break;

            case 'EXPIRATION':
            case 'BILLING_ISSUE':
                // Subscription has expired or failed to bill. Revoke premium access.
                user.isPremium = false;
                user.premiumPlan = null;
                user.premiumExpiresAt = null;
                console.log(`[RevenueCat] Revoked Premium for user ${user._id} due to ${type}.`);
                break;
                
            case 'TEST':
                console.log(`[RevenueCat] Test event received successfully.`);
                break;

            default:
                console.log(`[RevenueCat] Unhandled event type: ${type}`);
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
