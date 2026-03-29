import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AIHistory } from "@/lib/models/ai-history";

/**
 * GET /api/ai/learning-prompt
 *
 * Returns the exact prompt text that gets injected into every Gemini AI call,
 * built from all user feedback actions. This lets the UI visualize how
 * user decisions shape future AI suggestions in real time.
 */
export async function GET() {
  try {
    await connectDB();

    const recent = await AIHistory.find()
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    if (recent.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalActions: 0,
          approvals: [],
          denials: [],
          modifications: [],
          promptText: null,
          summary: "No user actions yet. The AI is using default recommendations with no personalization.",
        },
      });
    }

    const denials = recent.filter((f) => f.action === "deny");
    const modifications = recent.filter((f) => f.action === "modify");
    const approvals = recent.filter((f) => f.action === "approve");

    // Build the exact same prompt text used in campaign-suggestions and insights routes
    const promptText = `## USER FEEDBACK HISTORY (LEARN FROM THIS)
The seller has reviewed ${recent.length} past suggestions. Here is their decision history — USE THIS TO CALIBRATE YOUR RECOMMENDATIONS:

### Approved (${approvals.length} times) — These types of suggestions the seller likes:
${approvals.length > 0 ? approvals.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}" (by ${f.userEmail})`).join("\n") : "- (none yet)"}

### Denied (${denials.length} times) — AVOID making similar suggestions:
${denials.length > 0 ? denials.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's reason: "${f.userNote}"` : ""} (by ${f.userEmail})`).join("\n") : "- (none yet)"}

### Modified (${modifications.length} times) — The seller adjusted these:
${modifications.length > 0 ? modifications.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's adjustment: "${f.userNote}"` : ""} (by ${f.userEmail})`).join("\n") : "- (none yet)"}

IMPORTANT: Based on this feedback, adjust your suggestions. If the seller denied "lower_bid" suggestions, be more conservative with bid decreases. If they approved "increase_budget" suggestions, lean toward budget scaling. If they modified values, use their preferred range as a guide.`;

    // Build pattern analysis
    const typeBreakdown: Record<string, { approve: number; deny: number; modify: number }> = {};
    for (const entry of recent) {
      if (!typeBreakdown[entry.suggestionType]) {
        typeBreakdown[entry.suggestionType] = { approve: 0, deny: 0, modify: 0 };
      }
      typeBreakdown[entry.suggestionType][entry.action]++;
    }

    const patterns: string[] = [];
    for (const [type, counts] of Object.entries(typeBreakdown)) {
      const total = counts.approve + counts.deny + counts.modify;
      const label = type.replace(/_/g, " ");
      if (counts.deny > counts.approve) {
        patterns.push(`User tends to DENY "${label}" suggestions (${counts.deny}/${total} denied) → AI will avoid these`);
      } else if (counts.approve > counts.deny) {
        patterns.push(`User tends to APPROVE "${label}" suggestions (${counts.approve}/${total} approved) → AI will favor these`);
      }
      if (counts.modify > 0) {
        patterns.push(`User MODIFIED "${label}" ${counts.modify} time(s) → AI will adjust values to match user preferences`);
      }
    }

    // Summary describing what the AI learned
    const summaryParts: string[] = [];
    if (approvals.length > 0) summaryParts.push(`likes ${[...new Set(approvals.map(a => a.suggestionType.replace(/_/g, " ")))].join(", ")} suggestions`);
    if (denials.length > 0) summaryParts.push(`dislikes ${[...new Set(denials.map(d => d.suggestionType.replace(/_/g, " ")))].join(", ")} suggestions`);
    if (modifications.length > 0) summaryParts.push(`fine-tunes ${[...new Set(modifications.map(m => m.suggestionType.replace(/_/g, " ")))].join(", ")} values`);

    const summary = summaryParts.length > 0
      ? `Based on ${recent.length} actions, the AI learned that the seller ${summaryParts.join("; ")}.`
      : "Actions recorded but no clear patterns detected yet.";

    return NextResponse.json({
      success: true,
      data: {
        totalActions: recent.length,
        approvals: approvals.map((a) => ({
          type: a.suggestionType,
          title: a.suggestionTitle,
          campaign: a.campaignName,
          email: a.userEmail,
          timestamp: a.timestamp,
        })),
        denials: denials.map((d) => ({
          type: d.suggestionType,
          title: d.suggestionTitle,
          campaign: d.campaignName,
          email: d.userEmail,
          note: d.userNote,
          timestamp: d.timestamp,
        })),
        modifications: modifications.map((m) => ({
          type: m.suggestionType,
          title: m.suggestionTitle,
          campaign: m.campaignName,
          email: m.userEmail,
          note: m.userNote,
          timestamp: m.timestamp,
        })),
        typeBreakdown,
        patterns,
        summary,
        promptText,
        lastUpdated: recent[0]?.timestamp,
      },
    });
  } catch (err) {
    console.error("[AI Learning Prompt]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
