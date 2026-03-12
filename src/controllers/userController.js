import User from "../models/User.js";
import Trip from "../models/Trip.js";

// GET /api/users/:userID
export const getUser = async (req, res, next) => {
    try {
        const { userID } = req.params;
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Get trip count for this user
        const tripCount = await Trip.countDocuments({ userId: userID });

        res.status(200).json({
            ...user.toObject(),
            tripCount,
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/users/:userID
export const updateUser = async (req, res, next) => {
    try {
        const { userID } = req.params;
        const updateData = req.body;
        const updatedUser = await User.findByIdAndUpdate(userID, updateData, {
            new: true,
        });
        if (!updatedUser)
            return res.status(404).json({ error: "User not found" });
        res.status(200).json(updatedUser);
    } catch (err) {
        next(err);
    }
};

// DELETE /api/users/:userID
export const deleteUser = async (req, res, next) => {
    try {
        const { userID } = req.params;

        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Delete all trips associated with the user
        await Trip.deleteMany({ userId: userID });

        // Delete the user
        await User.findByIdAndDelete(userID);

        res.status(200).json({
            success: true,
            message: "Account and all associated data deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};
