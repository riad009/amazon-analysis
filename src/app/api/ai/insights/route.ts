import { NextRequest, NextResponse } from "next/server";
import { getModel, rotateFallbackModel } from "@/lib/gemini";
import { Campaign, ChangeEvent } from "@/lib/types";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaigns: Campaign[];
      changeEvents: ChangeEvent[];
      dateRange: { from: string; to: string };
      comparisonPeriod: { from: string; to: string };
    };

    const { campaigns, changeEvents, dateRange, comparisonPeriod } = body;

    const prompt = `${SYSTEM_PROMPT}

## Analysis Context
Current period: ${dateRange.from} → ${dateRange.to}
Previous period: ${comparisonPeriod.from} → ${comparisonPeriod.to}

## Change History (actual changes made by the seller)
${JSON.stringify(changeEvents, null, 2)}

## All Campaign Performance Data
${JSON.stringify(
  campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    current: {
      impressions: c.impressions, clicks: c.clicks, orders: c.orders,
      sales: c.sales, spend: c.spend, cpc: c.cpc, ctr: c.ctr,
      acos: c.acos, roas: c.roas, cvr: c.conversion,
    },
    previous: {
      impressions: c.prevImpressions, clicks: c.prevClicks,
      orders: c.prevOrders, sales: c.prevSales, spend: c.prevSpend,
      acos: c.prevAcos, roas: c.prevRoas,
    },
    relatedChanges: changeEvents.filter((e) => e.campaignId === c.id),
  })),
  null, 2
)}

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

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error("[AI Insights Error]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
