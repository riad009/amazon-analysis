import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationSettings extends Document {
    profileId: string;
    enabled: boolean;
    recipientEmail: string;
    intervalMinutes: number; // e.g. 1, 5, 15, 30, 60, 360, 720, 1440
    emailSubject: string;
    lastSentAt: Date | null;
}

const NotificationSettingsSchema = new Schema<INotificationSettings>(
    {
        profileId: { type: String, required: true, unique: true },
        enabled: { type: Boolean, default: false },
        recipientEmail: { type: String, default: "" },
        intervalMinutes: { type: Number, default: 60 },
        emailSubject: { type: String, default: "SellerOS — Campaign Performance Report" },
        lastSentAt: { type: Date, default: null },
    },
    { timestamps: true }
);

export const NotificationSettings: Model<INotificationSettings> =
    mongoose.models.NotificationSettings ||
    mongoose.model<INotificationSettings>("NotificationSettings", NotificationSettingsSchema);
