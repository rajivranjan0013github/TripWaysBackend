import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Please add a name"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Please add an email"],
            unique: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                "Please add a valid email",
            ],
        },
        picture: {
            type: String,
            default: null,
        },
        authProvider: {
            type: String,
            enum: ["google", "apple"],
        },
        platform: {
            type: String,
            enum: ["android", "ios"],
        },
        trips: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Trip",
            },
        ],
    },
    { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

export default User;
