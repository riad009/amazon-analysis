import { NextResponse } from "next/server";
import { isAmazonAdsConfigured, fetchProfiles } from "@/lib/amazon-ads";

/**
 * GET /api/amazon/profiles
 *
 * Returns available Amazon Ads profiles for the authenticated account.
 * Used for initial setup / profile selection.
 */
export async function GET() {
    if (!isAmazonAdsConfigured()) {
        return NextResponse.json({
            success: false,
            error: "Amazon Ads credentials not configured. Add AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET, AMAZON_ADS_REFRESH_TOKEN, and AMAZON_ADS_PROFILE_ID to your .env.local file.",
            configured: false,
        });
    }

    try {
        const profiles = await fetchProfiles();

        return NextResponse.json({
            success: true,
            configured: true,
            data: profiles,
        });
    } catch (err) {
        console.error("[Amazon Profiles API]", err);
        return NextResponse.json(
            { success: false, error: String(err), configured: true },
            { status: 500 }
        );
    }
}
