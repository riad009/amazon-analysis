import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { NotificationSettings } from "@/lib/models/notification-settings";
import { getDefaultProfileId } from "@/lib/amazon-ads";

// ─── GET: Read notification settings ────────────────────────────────────────

export async function GET(req: NextRequest) {
    await connectDB();
    const profileId = req.nextUrl.searchParams.get("profileId") || getDefaultProfileId() || "";

    let settings = await NotificationSettings.findOne({ profileId });
    if (!settings) {
        settings = await NotificationSettings.create({
            profileId,
            recipientEmail: "riadahmed.cse@gmail.com",
        });
    }

    return NextResponse.json({
        success: true,
        data: {
            profileId: settings.profileId,
            enabled: settings.enabled,
            recipientEmail: settings.recipientEmail,
            intervalMinutes: settings.intervalMinutes,
            emailSubject: settings.emailSubject,
            lastSentAt: settings.lastSentAt,
        },
    });
}

// ─── PUT: Update notification settings ──────────────────────────────────────

export async function PUT(req: NextRequest) {
    await connectDB();

    const body = await req.json();
    const profileId = body.profileId || getDefaultProfileId() || "";

    const update: Record<string, unknown> = {};
    if (body.enabled !== undefined) update.enabled = body.enabled;
    if (body.recipientEmail !== undefined) update.recipientEmail = body.recipientEmail;
    if (body.intervalMinutes !== undefined) {
        const mins = Number(body.intervalMinutes);
        if (isNaN(mins) || mins < 1) {
            return NextResponse.json(
                { success: false, error: "Interval must be at least 1 minute" },
                { status: 400 }
            );
        }
        update.intervalMinutes = mins;
    }
    if (body.emailSubject !== undefined) update.emailSubject = body.emailSubject;

    await NotificationSettings.updateOne(
        { profileId },
        { $set: update },
        { upsert: true }
    );

    const updated = await NotificationSettings.findOne({ profileId });

    return NextResponse.json({
        success: true,
        data: {
            profileId: updated?.profileId,
            enabled: updated?.enabled,
            recipientEmail: updated?.recipientEmail,
            intervalMinutes: updated?.intervalMinutes,
            emailSubject: updated?.emailSubject,
            lastSentAt: updated?.lastSentAt,
        },
    });
}
