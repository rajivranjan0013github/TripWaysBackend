import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const spotSchema = new mongoose.Schema({}, { strict: false });
const Spot = mongoose.model('Spot', spotSchema);

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const spots = await Spot.find({ city: 'Indore' }).sort({ createdAt: -1 }).limit(1).lean();
    process.exit(0);
}

check().catch(console.error);
