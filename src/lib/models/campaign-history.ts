import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICampaignHistory extends Document {
  profileId: string;
  campaignId: string;
  field: string;
  oldValue: any;
  newValue: any;
  changedBy: string; // user id or email
  changedAt: Date;
}

const CampaignHistorySchema = new Schema<ICampaignHistory>({
  profileId: { type: String, required: true, index: true },
  campaignId: { type: String, required: true, index: true },
  field: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed, required: true },
  newValue: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: String, required: true },
  changedAt: { type: Date, default: Date.now },
}, { timestamps: true });

CampaignHistorySchema.index({ profileId: 1, campaignId: 1, changedAt: -1 });

export const CampaignHistory: Model<ICampaignHistory> =
  mongoose.models.CampaignHistory ||
  mongoose.model<ICampaignHistory>("CampaignHistory", CampaignHistorySchema);
