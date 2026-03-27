import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDailyMetrics extends Document {
    profileId: string;
    campaignId: string;
    campaignName: string;
    date: string; // YYYY-MM-DD
    impressions: number;
    clicks: number;
    cost: number;
    orders: number;
    units: number;
    sales: number;
    fetchedAt: Date;
}

const DailyMetricsSchema = new Schema<IDailyMetrics>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        campaignName: { type: String, required: true },
        date: { type: String, required: true, index: true }, // YYYY-MM-DD
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
        units: { type: Number, default: 0 },
        sales: { type: Number, default: 0 },
        fetchedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Compound unique index: one entry per campaign per day per profile
DailyMetricsSchema.index(
    { profileId: 1, campaignId: 1, date: 1 },
    { unique: true }
);

export const DailyMetrics: Model<IDailyMetrics> =
    mongoose.models.DailyMetrics ||
    mongoose.model<IDailyMetrics>("DailyMetrics", DailyMetricsSchema);
