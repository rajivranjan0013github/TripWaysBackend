import ImportedVideo from "../models/ImportedVideo.js";

export const getUserImports = async (req, res, next) => {
    try {
        const { userID } = req.params;

        const imports = await ImportedVideo.find({ userId: userID })
            .sort({ createdAt: -1 })
            .lean();

        const summary = imports.map((item) => ({
            _id: item._id,
            platform: item.platform,
            status: item.status,
            destination: item.destination,
            title: item.title,
            caption: item.caption,
            thumbnailUrl: item.thumbnailUrl,
            cloudflareVideoUrl: item.cloudflareVideoUrl,
            originalUrl: item.originalUrl,
            totalExtractedPlaces: item.totalExtractedPlaces || 0,
            savedSpotCount: item.savedSpotCount || 0,
            processingTimeSeconds: item.processingTimeSeconds ?? null,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        }));

        res.status(200).json({
            success: true,
            totalImports: imports.length,
            imports: summary,
        });
    } catch (err) {
        next(err);
    }
};

export const getImportById = async (req, res, next) => {
    try {
        const { importID } = req.params;

        const importedVideo = await ImportedVideo.findById(importID).lean();
        if (!importedVideo) {
            return res.status(404).json({ success: false, error: "Import not found" });
        }

        res.status(200).json({
            success: true,
            import: importedVideo,
        });
    } catch (err) {
        next(err);
    }
};
