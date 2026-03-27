import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICronSettings extends Document {
    profileId: string;
    intervalHours: number; // e.g. 1, 12, 24, 48
    lastFetchedAt: Date | null;
    isFetching: boolean; // lock to prevent concurrent fetches
}

const CronSettingsSchema = new Schema<ICronSettings>(
    {
        profileId: { type: String, required: true, unique: true },
        intervalHours: { type: Number, default: 12 },
        lastFetchedAt: { type: Date, default: null },
        isFetching: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const CronSettings: Model<ICronSettings> =
    mongoose.models.CronSettings ||
    mongoose.model<ICronSettings>("CronSettings", CronSettingsSchema);
