import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * CampaignStructure — stores the full campaign data (name, budget, bidding, keywords, etc.)
 * fetched from the Amazon Ads API. Updated by fetch-metrics/cron, read by the Campaigns page.
 * One document per campaign per profile.
 */

export interface ICampaignStructure extends Document {
    profileId: string;
    campaignId: string;
    name: string;
    type: string;           // "SP Auto" | "SP Manual"
    status: string;         // "Enabled" | "Paused" | "Archived"
    dailyBudget: number;
    startDate: string;
    biddingStrategy: string;
    portfolio: string;
    keyword: string;
    bid: number;
    keywordId: string;
    placement: string;
    placementBidTOS: number;
    placementBidPP: number;
    updatedAt: Date;
}

const CampaignStructureSchema = new Schema<ICampaignStructure>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        type: { type: String, default: "" },
        status: { type: String, default: "Enabled" },
        dailyBudget: { type: Number, default: 0 },
        startDate: { type: String, default: "" },
        biddingStrategy: { type: String, default: "Fixed Bid" },
        portfolio: { type: String, default: "" },
        keyword: { type: String, default: "" },
        bid: { type: Number, default: 0 },
        keywordId: { type: String, default: "" },
        placement: { type: String, default: "Rest of Search" },
        placementBidTOS: { type: Number, default: 0 },
        placementBidPP: { type: Number, default: 0 },
    },
    { timestamps: true }
);

CampaignStructureSchema.index({ profileId: 1, campaignId: 1 }, { unique: true });

export const CampaignStructure: Model<ICampaignStructure> =
    mongoose.models.CampaignStructure ||
    mongoose.model<ICampaignStructure>("CampaignStructure", CampaignStructureSchema);
