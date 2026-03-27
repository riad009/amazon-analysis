import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * CampaignCache — stores the latest campaigns+metrics API response per profile.
 * The website reads from this cache for instant page loads, while background
 * processes update it from the full MongoDB metrics data.
 */

export interface ICampaignCache extends Document {
    profileId: string;
    dateFrom: string;
    dateTo: string;
    campaigns: unknown[];        // Full campaign data array
    placementData: unknown;      // Placement data map
    metricsAvailable: boolean;
    updatedAt: Date;
}

const CampaignCacheSchema = new Schema<ICampaignCache>(
    {
        profileId: { type: String, required: true },
        dateFrom: { type: String, required: true },
        dateTo: { type: String, required: true },
        campaigns: { type: Schema.Types.Mixed, default: [] },
        placementData: { type: Schema.Types.Mixed, default: {} },
        metricsAvailable: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Compound index so we can look up cache by profile + date range
CampaignCacheSchema.index({ profileId: 1, dateFrom: 1, dateTo: 1 }, { unique: true });

export const CampaignCache: Model<ICampaignCache> =
    mongoose.models.CampaignCache ||
    mongoose.model<ICampaignCache>("CampaignCache", CampaignCacheSchema);
