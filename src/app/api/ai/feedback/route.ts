import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

/**
 * Feedback storage — saves user actions (approve/deny/modify) on AI suggestions
 * to a JSON file so the AI can learn from past decisions.
 *
 * GET  → Returns all stored feedback
 * POST → Saves a new feedback entry
 */

const FEEDBACK_FILE = path.join(process.cwd(), "data", "ai-feedback.json");

export interface FeedbackEntry {
    id: string;
    campaignId: string;
    campaignName: string;
    suggestionType: string;
    suggestionTitle: string;
    action: "approve" | "deny" | "modify";
    userNote?: string;
    currentValue?: number;
    recommendedValue?: number;
    unit?: string;
    timestamp: string;
}

async function readFeedback(): Promise<FeedbackEntry[]> {
    try {
        const data = await fs.readFile(FEEDBACK_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeFeedback(entries: FeedbackEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(FEEDBACK_FILE), { recursive: true });
    await fs.writeFile(FEEDBACK_FILE, JSON.stringify(entries, null, 2));
}

// GET — retrieve all feedback for AI context
export async function GET() {
    const feedback = await readFeedback();
    return NextResponse.json({ success: true, data: feedback });
}

// POST — save a new feedback entry
export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as FeedbackEntry;

        const feedback = await readFeedback();

        // Add timestamp if not provided
        const entry: FeedbackEntry = {
            ...body,
            timestamp: body.timestamp || new Date().toISOString(),
        };

        feedback.push(entry);

        // Keep only last 200 entries to avoid file bloat
        const trimmed = feedback.slice(-200);

        await writeFeedback(trimmed);

        console.log(
            `[AI Feedback] ${entry.action.toUpperCase()} on "${entry.suggestionTitle}" for campaign "${entry.campaignName}"${entry.userNote ? ` — Note: ${entry.userNote}` : ""}`
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
