import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDailyPlacementMetrics extends Document {
    profileId: string;
    campaignId: string;
    date: string; // YYYY-MM-DD
    placement: string; // "Top of Search" | "Product Page" | "Rest of Search"
    impressions: number;
    clicks: number;
    cost: number;
    orders: number;
    units: number;
    sales: number;
    fetchedAt: Date;
}

const DailyPlacementMetricsSchema = new Schema<IDailyPlacementMetrics>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        date: { type: String, required: true, index: true },
        placement: { type: String, required: true },
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

// Compound unique index
DailyPlacementMetricsSchema.index(
    { profileId: 1, campaignId: 1, date: 1, placement: 1 },
    { unique: true }
);

export const DailyPlacementMetrics: Model<IDailyPlacementMetrics> =
    mongoose.models.DailyPlacementMetrics ||
    mongoose.model<IDailyPlacementMetrics>("DailyPlacementMetrics", DailyPlacementMetricsSchema);
