import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const ImportedVideoSchema = new mongoose.Schema({}, { strict: false });
const ImportedVideo = mongoose.model('ImportedVideo', ImportedVideoSchema);

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const imports = await ImportedVideo.find({ thumbnailUrl: { $ne: null } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    
   
    
    process.exit(0);
}

check().catch(console.error);
