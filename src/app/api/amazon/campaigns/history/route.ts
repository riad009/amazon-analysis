import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CampaignHistory } from "@/lib/models/campaign-history";

// ─── GET: Fetch change history for a campaign or all campaigns ──────────────
// Query params: profileId (required), campaignId (optional — if omitted, returns all)

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("profileId");
    const campaignId = searchParams.get("campaignId");
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: "Missing profileId" },
        { status: 400 }
      );
    }

    const filter: Record<string, string> = { profileId };
    if (campaignId) filter.campaignId = campaignId;

    const history = await CampaignHistory.find(filter)
      .sort({ changedAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, data: history });
  } catch (err) {
    console.error("[Campaign History] Error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
