import { NextRequest, NextResponse } from "next/server";
import { getModel, rotateFallbackModel } from "@/lib/gemini";
import { Campaign, ChangeEvent } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";

const FEEDBACK_FILE = path.join(process.cwd(), "data", "ai-feedback.json");

const SYSTEM_PROMPT = `You are an expert Amazon PPC (Pay-Per-Click) advertising analyst. 
You think like a senior PPC manager with 10+ years of experience optimizing Sponsored Products campaigns.

Your job is to analyze campaign performance data across two time periods, detect changes in the change history, 
and generate STRUCTURED, ACTIONABLE suggestions for each campaign.

Rules:
1. Always explain WHY you're making a suggestion (data-driven reasoning).
2. Detect if a performance change was caused by a USER ACTION (bid/budget change) or by the MARKET.
3. Warn about over-optimization (ACOS improved but volume collapsed).
4. Warn about Top of Search loss (impressions drop sharply after bid decrease).
5. Scale winning campaigns (high ROAS + low spend = underutilized budget).
6. Be conservative: prefer partial bid adjustments over extreme changes.
7. Return only valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaigns: Campaign[];
      changeEvents: ChangeEvent[];
      dateRange: { from: string; to: string };
    };

    const { campaigns, changeEvents, dateRange } = body;

    // Load past feedback for AI learning
    let feedbackContext = "";
    try {
      const feedbackData = await fs.readFile(FEEDBACK_FILE, "utf-8");
      const feedback = JSON.parse(feedbackData);
      if (feedback.length > 0) {
        // Get last 50 entries for context
        const recent = feedback.slice(-50);
        const denials = recent.filter((f: Record<string, string>) => f.action === "deny");
        const modifications = recent.filter((f: Record<string, string>) => f.action === "modify");
        const approvals = recent.filter((f: Record<string, string>) => f.action === "approve");

        feedbackContext = `

## USER FEEDBACK HISTORY (LEARN FROM THIS)
The seller has reviewed ${recent.length} past suggestions. Here is their decision history — USE THIS TO CALIBRATE YOUR RECOMMENDATIONS:

### Approved (${approvals.length} times) — These types of suggestions the seller likes:
${approvals.map((f: Record<string, string>) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"`).join("\n")}

### Denied (${denials.length} times) — AVOID making similar suggestions:
${denials.map((f: Record<string, string>) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's reason: "${f.userNote}"` : ""}`).join("\n")}

### Modified (${modifications.length} times) — The seller adjusted these:
${modifications.map((f: Record<string, string>) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's adjustment: "${f.userNote}"` : ""}`).join("\n")}

IMPORTANT: Based on this feedback, adjust your suggestions. If the seller denied "lower_bid" suggestions, be more conservative with bid decreases. If they approved "increase_budget" suggestions, lean toward budget scaling. If they modified values, use their preferred range as a guide.`;
      }
    } catch {
      // No feedback file yet — that's fine
    }

    const prompt = `${SYSTEM_PROMPT}${feedbackContext}

## Date Range
Current period: ${dateRange.from} to ${dateRange.to}

## Recent Change History (bid/budget/status changes made by seller)
${JSON.stringify(changeEvents, null, 2)}

## Campaign Performance Data
${JSON.stringify(
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        dailyBudget: c.dailyBudget,
        biddingStrategy: c.biddingStrategy,
        // Current period
        current: {
          impressions: c.impressions,
          clicks: c.clicks,
          orders: c.orders,
          units: c.units,
          sales: c.sales,
          spend: c.spend,
          cpc: c.cpc,
          ctr: c.ctr,
          acos: c.acos,
          roas: c.roas,
          conversionRate: c.conversion,
        },
        // Previous period
        previous: {
          impressions: c.prevImpressions,
          clicks: c.prevClicks,
          orders: c.prevOrders,
          sales: c.prevSales,
          spend: c.prevSpend,
          acos: c.prevAcos,
          roas: c.prevRoas,
        },
      })),
      null,
      2
    )}

## Instructions
For EACH campaign, analyze:
1. Current vs previous period metrics — calculate % changes
2. Whether any change event correlates with a performance shift
3. What the likely cause is (seller action vs market)
4. What the best action is (with specific numbers)

Return a JSON object with this exact structure:
{
  "campaignSuggestions": [
    {
      "campaignId": "string",
      "suggestions": [
        {
          "type": "raise_bid" | "lower_bid" | "increase_budget" | "decrease_budget" | "pause_campaign" | "enable_campaign" | "add_negative_keyword" | "adjust_placement",
          "title": "short title (max 10 words)",
          "description": "1-2 sentence description",
          "rationale": "data-driven explanation referencing specific metrics and changes",
          "impact": "estimated outcome (e.g. 'Est. ACOS improvement from 70% to 50-55%')",
          "confidence": "High" | "Medium" | "Low",
          "currentValue": number | null,
          "recommendedValue": number | null,
          "unit": "$" | "%" | null
        }
      ]
    }
  ]
}

Only include suggestions where there is a genuine actionable opportunity. 
If a campaign is performing well with no changes needed, return an empty suggestions array for it.
Include at most 2 suggestions per campaign.`;

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
      // Try to extract JSON from markdown code block
      const match = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse Gemini response as JSON");
      }
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error("[AI Campaign Suggestions Error]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
