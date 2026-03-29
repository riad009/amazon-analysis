import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AIHistory } from "@/lib/models/ai-history";

/**
 * Feedback storage — saves user actions (approve/deny/modify) on AI suggestions
 * to MongoDB so the AI can learn from past decisions.
 *
 * GET  → Returns recent feedback (last 200 entries)
 * POST → Saves a new feedback entry with user email
 */

// GET — retrieve recent feedback for AI context
export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);

        const feedback = await AIHistory.find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return NextResponse.json({ success: true, data: feedback });
    } catch (err) {
        console.error("[AI Feedback GET]", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}

// POST — save a new feedback entry
export async function POST(req: NextRequest) {
    try {
        await connectDB();

        const body = await req.json();

        const entry = await AIHistory.create({
            profileId: body.profileId || "",
            campaignId: body.campaignId,
            campaignName: body.campaignName,
            suggestionType: body.suggestionType,
            suggestionTitle: body.suggestionTitle,
            action: body.action,
            userEmail: body.userEmail || "unknown",
            userNote: body.userNote || undefined,
            currentValue: body.currentValue,
            recommendedValue: body.recommendedValue,
            unit: body.unit,
            timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        });

        console.log(
            `[AI Feedback] ${entry.action.toUpperCase()} by ${entry.userEmail} on "${entry.suggestionTitle}" for campaign "${entry.campaignName}"${entry.userNote ? ` — Note: ${entry.userNote}` : ""}`
        );

        return NextResponse.json({ success: true, saved: entry });
    } catch (err) {
        console.error("[AI Feedback]", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
