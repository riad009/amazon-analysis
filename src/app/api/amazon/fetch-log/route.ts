import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import { getDefaultProfileId } from "@/lib/amazon-ads";

export async function GET(req: NextRequest) {
    await connectDB();
    const profileId = req.nextUrl.searchParams.get("profileId") || getDefaultProfileId() || "";
    const { FetchLog } = getProfileModels(profileId);

    const logs = await FetchLog.find({ profileId })
        .sort({ fetchedAt: -1 })
        .limit(20)
        .lean();

    return NextResponse.json({
        success: true,
        data: logs,
    });
}
