import DownloadError from "../models/DownloadError.js";

/**
 * GET /api/admin/download-errors
 * Query params:
 *   - limit (default 50, max 200)
 *   - skip (default 0)
 *   - errorCode (filter by specific error code)
 *   - platform (filter by platform)
 *   - tool (filter by tool: "yt-dlp" or "gallery-dl")
 *   - since (ISO date string, only errors after this date)
 */
export const getDownloadErrors = async (req, res, next) => {
    try {
        const {
            limit = 50,
            skip = 0,
            errorCode,
            platform,
            tool,
            since,
        } = req.query;

        const filter = {};
        if (errorCode) filter.errorCode = errorCode;
        if (platform) filter.platform = platform;
        if (tool) filter.tool = tool;
        if (since) filter.createdAt = { $gte: new Date(since) };

        const clampedLimit = Math.min(parseInt(limit) || 50, 200);
        const clampedSkip = parseInt(skip) || 0;

        const [errors, totalCount] = await Promise.all([
            DownloadError.find(filter)
                .sort({ createdAt: -1 })
                .skip(clampedSkip)
                .limit(clampedLimit)
                .lean(),
            DownloadError.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            total: totalCount,
            returned: errors.length,
            skip: clampedSkip,
            limit: clampedLimit,
            errors,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/admin/download-errors/stats
 * Aggregated error statistics — counts by errorCode and platform.
 */
export const getDownloadErrorStats = async (req, res, next) => {
    try {
        const { since } = req.query;
        const matchStage = since ? { $match: { createdAt: { $gte: new Date(since) } } } : { $match: {} };

        const [byCode, byPlatform, byTool, totalCount] = await Promise.all([
            DownloadError.aggregate([
                matchStage,
                { $group: { _id: "$errorCode", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            DownloadError.aggregate([
                matchStage,
                { $group: { _id: "$platform", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            DownloadError.aggregate([
                matchStage,
                { $group: { _id: "$tool", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            DownloadError.countDocuments(since ? { createdAt: { $gte: new Date(since) } } : {}),
        ]);

        const fallbackSuccessCount = await DownloadError.countDocuments({
            fallbackSucceeded: true,
            ...(since ? { createdAt: { $gte: new Date(since) } } : {}),
        });

        res.status(200).json({
            success: true,
            totalErrors: totalCount,
            fallbackSuccessCount,
            byErrorCode: Object.fromEntries(byCode.map(r => [r._id, r.count])),
            byPlatform: Object.fromEntries(byPlatform.map(r => [r._id, r.count])),
            byTool: Object.fromEntries(byTool.map(r => [r._id, r.count])),
        });
    } catch (err) {
        next(err);
    }
};
