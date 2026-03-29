import { NextRequest, NextResponse } from "next/server";
import { getModel, rotateFallbackModel } from "@/lib/gemini";
import { Campaign, ChangeEvent } from "@/lib/types";
import { connectDB } from "@/lib/mongodb";
import { AIHistory } from "@/lib/models/ai-history";

const SYSTEM_PROMPT = `You are an expert Amazon PPC analyst with 10+ years of experience.
You think across TIME — not just looking at current metrics, but understanding WHAT CHANGED, WHY it changed, and WHAT TO DO.

You are NOT a rules-based dashboard. You reason like a human PPC manager who:
- Tracks the timeline of events (when bids/budgets changed)
- Knows when a performance drop was caused by their own action vs. the market
- Detects over-optimization (ACOS improved but volume collapsed)
- Detects Top of Search loss (impressions drop sharply after bid cuts)
- Celebrates wins and scales them
- Always explains reasoning clearly

IMPORTANT: Return only valid JSON, no markdown.`;

// ─── Smart Campaign Filtering + TSV Compression ──────────────────────────────
// Two optimizations to cut token usage ~95%:
// 1. Smart filter: score campaigns by importance, keep top ~75
// 2. TSV format: tabular data instead of JSON (field names once vs. per-row)
//
// Before: 686 campaigns × ~200 tokens/campaign (JSON) = ~137K tokens
// After:  75 campaigns × ~50 tokens/row (TSV) + summary  = ~4K tokens

const MAX_DETAILED_CAMPAIGNS = 75;

interface ScoredCampaign {
  campaign: Campaign;
  score: number;
  flags: string[];
}

function smartFilterCampaigns(
  campaigns: Campaign[],
  changeEvents: ChangeEvent[]
): {
  tsvTable: string;
  skippedSummary: string;
  stats: { total: number; analyzed: number; skipped: number; deadCount: number };
} {
  const changedCampaignIds = new Set(changeEvents.map((e) => e.campaignId));

  // Score each campaign by importance
  const scored: ScoredCampaign[] = campaigns.map((c) => {
    let score = 0;
    const flags: string[] = [];

    // Dead campaign — zero activity in both periods
    const currentActivity = (c.impressions || 0) + (c.spend || 0);
    const prevActivity = (c.prevImpressions || 0) + (c.prevSpend || 0);
    if (currentActivity === 0 && prevActivity === 0) {
      return { campaign: c, score: -1, flags: ["dead"] };
    }

    // Has recent change history — always include
    if (changedCampaignIds.has(c.id)) {
      score += 50;
      flags.push("changed");
    }

    // Spend-based importance (higher spend = more impact)
    score += Math.min(30, (c.spend || 0) / 10);

    // High ACOS (unprofitable) — needs attention
    if (c.acos > 80) { score += 20; flags.push("high-acos"); }
    else if (c.acos > 50) { score += 10; flags.push("elevated-acos"); }

    // Large drops in impressions or sales — possible problems
    if (c.prevImpressions && c.prevImpressions > 100) {
      const impDrop = ((c.impressions || 0) - c.prevImpressions) / c.prevImpressions;
      if (impDrop < -0.3) { score += 25; flags.push("imp-drop"); }
    }
    if (c.prevSales && c.prevSales > 0) {
      const salesDrop = ((c.sales || 0) - c.prevSales) / c.prevSales;
      if (salesDrop < -0.3) { score += 20; flags.push("sales-drop"); }
    }

    // Scaling opportunity — high ROAS + active
    if (c.roas > 3 && c.spend > 5) { score += 15; flags.push("scale-opp"); }

    // Budget limited signals
    if (c.impressions > 500 && c.clicks > 0 && c.conversion > 5 && c.roas > 2) {
      score += 10; flags.push("strong");
    }

    return { campaign: c, score, flags: flags.length > 0 ? flags : ["baseline"] };
  });

  // Separate dead campaigns and active ones
  const active = scored.filter((s) => s.score >= 0);
  const dead = scored.filter((s) => s.score < 0);

  // Sort by score descending, take top N
  active.sort((a, b) => b.score - a.score);
  const detailed = active.slice(0, MAX_DETAILED_CAMPAIGNS);
  const skippedActive = active.slice(MAX_DETAILED_CAMPAIGNS).map((s) => s.campaign);

  // ── Build TSV table (70% fewer tokens than JSON) ──
  const TSV_HEADER = [
    "id", "name", "status", "budget",
    "impr", "clicks", "orders", "sales", "spend", "cpc", "ctr%", "acos%", "roas", "cvr%",
    "p_impr", "p_clicks", "p_orders", "p_sales", "p_spend", "p_acos%", "p_roas",
    "flags",
  ].join("\t");

  const tsvRows = detailed.map(({ campaign: c, flags }) => [
    c.id,
    c.name,
    c.status,
    (c.dailyBudget || 0).toFixed(2),
    c.impressions || 0,
    c.clicks || 0,
    c.orders || 0,
    (c.sales || 0).toFixed(2),
    (c.spend || 0).toFixed(2),
    (c.cpc || 0).toFixed(2),
    (c.ctr || 0).toFixed(1),
    (c.acos || 0).toFixed(1),
    (c.roas || 0).toFixed(2),
    (c.conversion || 0).toFixed(1),
    c.prevImpressions || 0,
    c.prevClicks || 0,
    c.prevOrders || 0,
    (c.prevSales || 0).toFixed(2),
    (c.prevSpend || 0).toFixed(2),
    (c.prevAcos || 0).toFixed(1),
    (c.prevRoas || 0).toFixed(2),
    flags.join(","),
  ].join("\t"));

  const tsvTable = [TSV_HEADER, ...tsvRows].join("\n");

  // ── Build compact summary for skipped campaigns ──
  const allSkipped = [...skippedActive, ...dead.map((s) => s.campaign)];
  let skippedSummary = "";
  if (allSkipped.length > 0) {
    const skippedTotalSpend = allSkipped.reduce((s, c) => s + (c.spend || 0), 0);
    const skippedTotalSales = allSkipped.reduce((s, c) => s + (c.sales || 0), 0);
    const skippedTotalImpressions = allSkipped.reduce((s, c) => s + (c.impressions || 0), 0);
    const skippedEnabled = allSkipped.filter((c) => c.status === "Enabled").length;
    const skippedPaused = allSkipped.filter((c) => c.status === "Paused").length;
    skippedSummary = `
## Remaining ${allSkipped.length} Campaigns (lower priority — summarized)
- Total spend: $${skippedTotalSpend.toFixed(2)} | Sales: $${skippedTotalSales.toFixed(2)} | Impressions: ${skippedTotalImpressions.toLocaleString()}
- ${dead.length} campaigns with zero activity both periods
- ${skippedEnabled} enabled, ${skippedPaused} paused
- Avg ACOS: ${skippedActive.length > 0 ? (skippedActive.reduce((s, c) => s + (c.acos || 0), 0) / skippedActive.length).toFixed(1) : "N/A"}%
NOTE: If you suspect an issue in this group, mention it as a general portfolio observation.`;
  }

  return {
    tsvTable,
    skippedSummary,
    stats: {
      total: campaigns.length,
      analyzed: detailed.length,
      skipped: allSkipped.length,
      deadCount: dead.length,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaigns: Campaign[];
      changeEvents: ChangeEvent[];
      dateRange: { from: string; to: string };
      comparisonPeriod: { from: string; to: string };
    };

    const { campaigns, changeEvents, dateRange, comparisonPeriod } = body;

    // Smart filter: prioritize important campaigns, compress to TSV
    const { tsvTable, skippedSummary, stats } = smartFilterCampaigns(campaigns, changeEvents);
    console.log(`[AI Insights] Smart filter: ${stats.total} total → ${stats.analyzed} detailed (TSV), ${stats.skipped} summarized, ${stats.deadCount} dead`);

    // Load AI feedback history for learning
    let feedbackContext = "";
    try {
      await connectDB();
      const recent = await AIHistory.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      if (recent.length > 0) {
        const denials = recent.filter((f) => f.action === "deny");
        const approvals = recent.filter((f) => f.action === "approve");
        const modifications = recent.filter((f) => f.action === "modify");

        feedbackContext = `

## USER FEEDBACK HISTORY (LEARN FROM THIS)
The seller reviewed ${recent.length} past suggestions:
- Approved ${approvals.length}: ${approvals.slice(0, 10).map((f) => `"${f.suggestionTitle}"`).join(", ") || "none yet"}
- Denied ${denials.length}: ${denials.slice(0, 10).map((f) => `"${f.suggestionTitle}"${f.userNote ? ` (reason: ${f.userNote})` : ""}`).join(", ") || "none yet"}
- Modified ${modifications.length}: ${modifications.slice(0, 10).map((f) => `"${f.suggestionTitle}"${f.userNote ? ` (${f.userNote})` : ""}`).join(", ") || "none yet"}

Adjust your recommendations based on this feedback — avoid repeating denied suggestion patterns.`;
      }
    } catch {
      // No feedback yet
    }

    const prompt = `${SYSTEM_PROMPT}${feedbackContext}

## Analysis Context
Current period: ${dateRange.from} → ${dateRange.to}
Previous period: ${comparisonPeriod.from} → ${comparisonPeriod.to}
Portfolio: ${stats.total} total campaigns → ${stats.analyzed} priority campaigns analyzed in detail below, ${stats.skipped} low-activity campaigns summarized

## Change History (actual changes made by the seller)
${changeEvents.length > 0 ? changeEvents.map((e) => `- ${e.campaignId}: ${e.field || e.changeType} changed from ${e.oldValue} → ${e.newValue} on ${e.changedAt}`).join("\n") : "(no recent changes)"}

## Priority Campaign Performance Data (${stats.analyzed} of ${stats.total} campaigns — TSV format)
Columns: id, name, status, budget, impr, clicks, orders, sales, spend, cpc, ctr%, acos%, roas, cvr%, p_impr, p_clicks, p_orders, p_sales, p_spend, p_acos%, p_roas, flags
(p_ = previous period. flags: changed=had bid/budget changes, high-acos=ACOS>80%, imp-drop=impressions fell 30%+, sales-drop=sales fell 30%+, scale-opp=high ROAS+active, strong=solid performer)

${tsvTable}
${skippedSummary}

## Your Task
Generate timeline-aware insights. For each significant finding, produce a structured insight.

Focus on:
1. **Top of Search Loss** — impressions dropped significantly after a bid decrease
2. **Over-Optimization** — ACOS improved but volume (orders/sales) collapsed  
3. **Declining campaigns** — multiple metrics deteriorating, possibly after changes
4. **Unprofitable campaigns** — ACOS > 80%, ROAS < 1.2, losing money
5. **Scaling opportunities** — high ROAS + low spend + strong CVR = scale immediately

For each insight, you MUST produce a specific recommended action with exact values 
(e.g. "raise bid from $2.24 to $2.65" not just "raise bids").

Return this exact JSON structure:
{
  "insights": [
    {
      "campaignId": "string",
      "campaignName": "string",
      "category": "top_of_search_loss" | "over_optimized" | "declining" | "dying" | "improving" | "budget_limited",
      "severity": "critical" | "warning" | "opportunity" | "info",
      "title": "Concise title (max 12 words)",
      "whatChanged": "What metrics changed and by how much (include specific numbers + % changes)",
      "likelyCause": "Root cause analysis — was this caused by a seller action (reference the specific change event date + values) or market forces? Be specific.",
      "recommendedAction": "Step-by-step recommendation with specific values. E.g. 'Raise bid from $2.24 → $2.65 (+18%). Monitor Top of Search impression share for 3-5 days.'",
      "confidence": "High" | "Medium" | "Low",
      "confidenceScore": 0-100,
      "metrics": [
        {
          "label": "ACOS" | "ROAS" | "Impressions" | "Clicks" | "Orders" | "Sales" | "Spend" | "CPC" | "CVR",
          "current": number,
          "previous": number,
          "change": number (% change, positive = increased, negative = decreased),
          "unit": "$" | "%" | "x" | ""
        }
      ],
      "structuredAction": {
        "type": "raise_bid" | "lower_bid" | "increase_budget" | "decrease_budget" | "pause_campaign" | "enable_campaign" | "add_negative_keyword" | "adjust_placement",
        "title": "Action title",
        "description": "What exactly to do",
        "rationale": "Why this action based on the data",
        "impact": "Expected outcome",
        "confidence": "High" | "Medium" | "Low",
        "currentValue": number | null,
        "recommendedValue": number | null,
        "unit": "$" | "%" | null
      }
    }
  ],
  "portfolioSummary": {
    "overallHealth": "good" | "declining" | "mixed" | "critical",
    "topOpportunity": "string - single most impactful action for the whole portfolio",
    "biggestRisk": "string - the most urgent problem to fix"
  }
}

Generate insights only for campaigns with genuinely notable changes or opportunities.
Sort insights by severity (critical first).`;

    // Try up to 3 fallback models
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await getModel().generateContent(prompt);
        break;
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes("429") || msg.includes("Too Many Requests")) {
          const canFallback = rotateFallbackModel();
          if (!canFallback || attempt === 2) {
            return NextResponse.json(
              { success: false, error: "Gemini API rate limit reached. Please wait a minute and try again.", code: "RATE_LIMIT" },
              { status: 429 }
            );
          }
          continue;
        }
        throw err;
      }
    }
    if (!result) throw new Error("No result from Gemini after retries");
    const text = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse Gemini response as JSON");
      }
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      filterStats: {
        total: stats.total,
        analyzed: stats.analyzed,
        skipped: stats.skipped,
        deadCount: stats.deadCount,
      },
    });
  } catch (err) {
    console.error("[AI Insights Error]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
