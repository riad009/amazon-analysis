import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AIPromptSettings, PromptMode } from "@/lib/models/ai-prompt-settings";

const DEFAULT_PROMPTS: Record<PromptMode, string> = {
  profit:
    "Focus on profitability. Prioritize reducing ACOS, improving ROAS, and cutting wasteful spend. " +
    "Recommend bid decreases for high-ACOS keywords, pausing unprofitable campaigns, and scaling " +
    "campaigns with ROAS > 3. Always include specific dollar amounts and percentage targets.",
  rank:
    "Focus on ranking and visibility. Prioritize impression share and Top of Search placement. " +
    "Recommend bid increases to reclaim lost TOS IS, budget increases for strong-converting campaigns, " +
    "and aggressive scaling of campaigns with high CTR. Emphasize market share over short-term profitability.",
  maintenance:
    "Focus on stability and maintenance. Avoid drastic changes. Look for minor inefficiencies that " +
    "can be trimmed without disrupting performance. Recommend conservative bid adjustments (±10-15%), " +
    "flag campaigns at risk of going over budget, and suggest negative keywords to reduce wasted spend.",
};

export async function GET() {
  try {
    await connectDB();

    // Fetch or seed all 3 modes
    const modes: PromptMode[] = ["profit", "rank", "maintenance"];
    const results: Record<string, string> = {};

    for (const mode of modes) {
      let doc = await AIPromptSettings.findOne({ mode }).lean();
      if (!doc) {
        // Seed with default
        await AIPromptSettings.create({ mode, prompt: DEFAULT_PROMPTS[mode] });
        results[mode] = DEFAULT_PROMPTS[mode];
      } else {
        results[mode] = (doc as { prompt: string }).prompt;
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error("[AI Prompts GET]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { mode: PromptMode; prompt: string };
    const { mode, prompt } = body;

    if (!["profit", "rank", "maintenance"].includes(mode)) {
      return NextResponse.json({ success: false, error: "Invalid mode" }, { status: 400 });
    }

    await connectDB();

    await AIPromptSettings.findOneAndUpdate(
      { mode },
      { prompt },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[AI Prompts POST]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
