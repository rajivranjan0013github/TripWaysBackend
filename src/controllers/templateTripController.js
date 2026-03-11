import TemplateTrip from "../models/TemplateTrip.js";

/**
 * GET /api/template-trips — List all active template trips (summary only)
 */
export const getTemplateTrips = async (req, res, next) => {
    try {
        const trips = await TemplateTrip.find({ isActive: true })
            .sort({ createdAt: 1 })
            .select("title destination days description coverImage tags spots")
            .lean();

        res.status(200).json({ success: true, trips });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/template-trips/:id — Get full template trip with itinerary
 */
export const getTemplateTrip = async (req, res, next) => {
    try {
        const { id } = req.params;
        const trip = await TemplateTrip.findById(id).lean();

        if (!trip || !trip.isActive) {
            return res.status(404).json({ error: "Template trip not found" });
        }

        res.status(200).json({ success: true, trip });
    } catch (err) {
        next(err);
    }
};
