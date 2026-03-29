import { NextRequest, NextResponse } from "next/server";
import { getModel, rotateFallbackModel } from "@/lib/gemini";
import { Campaign, ChangeEvent } from "@/lib/types";
import { connectDB } from "@/lib/mongodb";
import { AIHistory } from "@/lib/models/ai-history";

const SYSTEM_PROMPT = `You are an expert Amazon PPC (Pay-Per-Click) advertising analyst.
You think like a senior PPC manager with 10+ years of experience optimizing Sponsored Products campaigns.

Your job is to analyze a SINGLE campaign's performance data across two time periods, detect changes,
and generate STRUCTURED, ACTIONABLE suggestions.

## Detection Rules — Think Like a Human PPC Manager

### 1. Performance Changes Over Time
- Compare current vs previous period metrics: impressions, clicks, orders, sales, ACOS, ROAS, CPC, CTR
- Flag ANY metric that changed more than ±15%

### 2. Root Cause Attribution — Was it US or the MARKET?
- If a bid or budget change exists in the change history within the date range, and performance shifted AFTER that change → likely caused by OUR ACTION
- If no bid/budget change exists but performance shifted → likely MARKET driven (competition, seasonality, algorithm change)
- Always state which one: "Caused by: seller action (bid decrease on [date])" or "Caused by: market shift"

### 3. Side Effects Detection
- **Over-optimization**: ACOS improved but clicks/orders/sales dropped significantly → we cut too much
- **Top of Search Loss**: After a bid decrease, TOS IS (Top of Search Impression Share) dropped → lost premium placement
- **Volume collapse**: Spend went down AND sales went down proportionally or more → not saving money, just losing volume
- **Budget capping**: High CTR, good conversion, but impressions plateau or drop → budget too low

### 4. Actionable Insight Categories
- "Campaign losing Top of Search after bid decrease" → recommend partial bid restoration
- "Previously strong campaign now declining" → recommend investigation + possible bid increase
- "ACOS improved but volume collapsed (over-optimized)" → recommend partial bid/budget restoration
- "Dying campaign with falling impression share" → recommend pause or aggressive bid increase
- "Strong performer with room to scale" → recommend budget increase

## Output Per Suggestion
Each suggestion MUST include:
- What changed (specific metrics with % changes)
- Likely cause (seller action or market, with evidence)
- Clear recommended action (e.g., "raise bid from $1.20 to $1.40–$1.50")
- Confidence level (High/Medium/Low based on data strength)

Rules:
1. Always explain WHY you're making a suggestion (data-driven reasoning).
2. Be conservative: prefer partial adjustments over extreme changes.
3. Return only valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaign: Campaign;
      changeEvents: ChangeEvent[];
      dateRange: { from: string; to: string };
    };

    const { campaign, changeEvents, dateRange } = body;

    // Filter change events to only this campaign
    const campaignChanges = changeEvents.filter(
      (e) => e.campaignId === campaign.id
    );

    // Load past feedback from MongoDB for AI learning
    let feedbackContext = "";
    try {
      await connectDB();
      const recent = await AIHistory.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      if (recent.length > 0) {
        const denials = recent.filter((f) => f.action === "deny");
        const modifications = recent.filter((f) => f.action === "modify");
        const approvals = recent.filter((f) => f.action === "approve");

        feedbackContext = `

## USER FEEDBACK HISTORY (LEARN FROM THIS)
The seller has reviewed ${recent.length} past suggestions. Here is their decision history — USE THIS TO CALIBRATE YOUR RECOMMENDATIONS:

### Approved (${approvals.length} times) — These types of suggestions the seller likes:
${approvals.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}" (by ${f.userEmail})`).join("\n")}

### Denied (${denials.length} times) — AVOID making similar suggestions:
${denials.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's reason: "${f.userNote}"` : ""} (by ${f.userEmail})`).join("\n")}

### Modified (${modifications.length} times) — The seller adjusted these:
${modifications.map((f) => `- ${f.suggestionType}: "${f.suggestionTitle}" for "${f.campaignName}"${f.userNote ? ` — Seller's adjustment: "${f.userNote}"` : ""} (by ${f.userEmail})`).join("\n")}

IMPORTANT: Based on this feedback, adjust your suggestions. If the seller denied "lower_bid" suggestions, be more conservative with bid decreases. If they approved "increase_budget" suggestions, lean toward budget scaling. If they modified values, use their preferred range as a guide.`;
      }
    } catch {
      // No feedback yet — that's fine
    }

    const prompt = `${SYSTEM_PROMPT}${feedbackContext}

## Date Range
Current period: ${dateRange.from} to ${dateRange.to}

## Recent Change History for This Campaign
${campaignChanges.length > 0
        ? JSON.stringify(campaignChanges, null, 2)
        : "No recent bid/budget/status changes recorded for this campaign."
      }

## Campaign Performance Data
${JSON.stringify(
        {
          id: campaign.id,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          dailyBudget: campaign.dailyBudget,
          biddingStrategy: campaign.biddingStrategy,
          keyword: campaign.keyword,
          bid: campaign.bid,
          placement: campaign.placement,
          placementBidTOS: campaign.placementBidTOS,
          placementBidPP: campaign.placementBidPP,
          tosIS: campaign.tosIS,
          current: {
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            orders: campaign.orders,
            units: campaign.units,
            sales: campaign.sales,
            spend: campaign.spend,
            cpc: campaign.cpc,
            ctr: campaign.ctr,
            acos: campaign.acos,
            roas: campaign.roas,
            conversionRate: campaign.conversion,
          },
          previous: {
            impressions: campaign.prevImpressions,
            clicks: campaign.prevClicks,
            orders: campaign.prevOrders,
            sales: campaign.prevSales,
            spend: campaign.prevSpend,
            acos: campaign.prevAcos,
            roas: campaign.prevRoas,
          },
        },
        null,
        2
      )}

## Instructions
Analyze this single campaign deeply:
1. Current vs previous period metrics — calculate exact % changes for each metric
2. Whether any change event correlates with a performance shift (root cause)
3. Whether the change was caused by seller action or market forces
4. Check for side effects: over-optimization, TOS loss, volume collapse, budget capping
5. What the best action is (with specific numbers)

Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "type": "raise_bid" | "lower_bid" | "increase_budget" | "decrease_budget" | "pause_campaign" | "enable_campaign" | "add_negative_keyword" | "adjust_placement",
      "title": "short title (max 10 words)",
      "description": "1-2 sentence description of what changed and what to do",
      "rationale": "data-driven explanation: what changed (with % numbers), likely cause (seller action or market), and why this action helps",
      "impact": "estimated outcome (e.g. 'Est. ACOS improvement from 70% to 50-55%')",
      "confidence": "High" | "Medium" | "Low",
      "currentValue": number | null,
      "recommendedValue": number | null,
      "unit": "$" | "%" | null
    }
  ]
}

Only include suggestions where there is a genuine actionable opportunity.
If the campaign is performing well with no changes needed, return an empty suggestions array.
Include at most 3 suggestions.`;

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
