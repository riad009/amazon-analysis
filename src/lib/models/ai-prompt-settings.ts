import mongoose, { Schema, Document, Model } from "mongoose";

export type PromptMode = "profit" | "rank" | "maintenance";

export interface IAIPromptSettings extends Document {
  mode: PromptMode;
  prompt: string;
  updatedAt: Date;
}

const AIPromptSettingsSchema = new Schema<IAIPromptSettings>(
  {
    mode: {
      type: String,
      enum: ["profit", "rank", "maintenance"],
      required: true,
      unique: true,
    },
    prompt: { type: String, required: true, default: "" },
  },
  { timestamps: true }
);

export const AIPromptSettings: Model<IAIPromptSettings> =
  mongoose.models.AIPromptSettings ||
  mongoose.model<IAIPromptSettings>("AIPromptSettings", AIPromptSettingsSchema);
