import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import { getDefaultProfileId } from "@/lib/amazon-ads";

export async function GET(req: NextRequest) {
    await connectDB();
    const profileId = req.nextUrl.searchParams.get("profileId") || getDefaultProfileId() || "";
    const { CronSettings } = getProfileModels(profileId);

    let settings = await CronSettings.findOne({ profileId });
    if (!settings) {
        settings = await CronSettings.create({ profileId, intervalHours: 24 });
    }

    return NextResponse.json({
        success: true,
        data: {
            profileId: settings.profileId,
            intervalHours: settings.intervalHours,
            lastFetchedAt: settings.lastFetchedAt,
            isFetching: settings.isFetching,
        },
    });
}

export async function PUT(req: NextRequest) {
    await connectDB();

    const body = await req.json();
    const profileId = body.profileId || getDefaultProfileId() || "";
    const { CronSettings } = getProfileModels(profileId);
    const intervalHours = body.intervalHours;

    if (!intervalHours || intervalHours <= 0) {
        return NextResponse.json(
            { success: false, error: "Invalid interval. Must be a positive number." },
            { status: 400 }
        );
    }

    await CronSettings.updateOne(
        { profileId },
        { intervalHours },
        { upsert: true }
    );

    return NextResponse.json({
        success: true,
        intervalHours,
    });
}
