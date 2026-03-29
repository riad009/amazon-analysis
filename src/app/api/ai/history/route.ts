import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AIHistory } from "@/lib/models/ai-history";

/**
 * GET /api/ai/history — Fetch AI action history for display in the UI
 * Query params:
 *   - profileId (optional): filter by profile
 *   - limit (optional, default 100): max entries to return
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("profileId");
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

    const filter: Record<string, string> = {};
    if (profileId) filter.profileId = profileId;

    const history = await AIHistory.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, data: history });
  } catch (err) {
    console.error("[AI History] Error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
