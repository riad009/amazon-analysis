import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFetchLog extends Document {
    profileId: string;
    fetchedAt: Date;
    status: "success" | "error" | "in_progress" | "cancelled" | "abandoned";
    campaignsCount: number;
    placementRowsCount: number;
    durationMs: number;
    dateRangeFetched: string; // e.g. "2026-03-10"
    error?: string;
}

const FetchLogSchema = new Schema<IFetchLog>(
    {
        profileId: { type: String, required: true, index: true },
        fetchedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ["success", "error", "in_progress", "cancelled", "abandoned"], default: "in_progress" },
        campaignsCount: { type: Number, default: 0 },
        placementRowsCount: { type: Number, default: 0 },
        durationMs: { type: Number, default: 0 },
        dateRangeFetched: { type: String, default: "" },
        error: { type: String },
    },
    { timestamps: true }
);

export const FetchLog: Model<IFetchLog> =
    mongoose.models.FetchLog ||
    mongoose.model<IFetchLog>("FetchLog", FetchLogSchema);
