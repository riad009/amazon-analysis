import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAIHistory extends Document {
  profileId: string;
  campaignId: string;
  campaignName: string;
  suggestionType: string;
  suggestionTitle: string;
  action: "approve" | "deny" | "modify";
  userEmail: string;
  userNote?: string;
  currentValue?: number | string;
  recommendedValue?: number | string;
  unit?: string;
  timestamp: Date;
}

const AIHistorySchema = new Schema<IAIHistory>(
  {
    profileId: { type: String, default: "" },
    campaignId: { type: String, required: true },
    campaignName: { type: String, required: true },
    suggestionType: { type: String, required: true },
    suggestionTitle: { type: String, required: true },
    action: { type: String, enum: ["approve", "deny", "modify"], required: true },
    userEmail: { type: String, required: true },
    userNote: { type: String },
    currentValue: { type: Schema.Types.Mixed },
    recommendedValue: { type: Schema.Types.Mixed },
    unit: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AIHistorySchema.index({ profileId: 1, timestamp: -1 });
AIHistorySchema.index({ timestamp: -1 });

export const AIHistory: Model<IAIHistory> =
  mongoose.models.AIHistory ||
  mongoose.model<IAIHistory>("AIHistory", AIHistorySchema);
