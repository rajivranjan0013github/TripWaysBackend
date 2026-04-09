/**
 * One-time migration script to normalize all existing country names in the Spots collection.
 * Run with: node src/scripts/normalizeExistingCountries.js
 *
 * This finds all distinct country names, checks if any need normalization,
 * and bulk-updates them. Safe to run multiple times (idempotent).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { normalizeCountryName } from '../utils/countryNormalizer.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);

    const Spot = mongoose.connection.collection('spots');

    // 1. Get all distinct country names
    const distinctCountries = await Spot.distinct('country');

    const updates = [];

    for (const raw of distinctCountries) {
        const normalized = normalizeCountryName(raw);
        if (normalized !== raw) {
            updates.push({ from: raw, to: normalized });
        } else {
        }
    }

    if (updates.length === 0) {
        await mongoose.disconnect();
        return;
    }


    for (const { from, to } of updates) {
        const result = await Spot.updateMany(
            { country: from },
            { $set: { country: to } }
        );

        // Also fix city field if it was set to the old country name
        const cityResult = await Spot.updateMany(
            { city: from },
            { $set: { city: to } }
        );
        if (cityResult.modifiedCount > 0) {
        }
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
