import { NextRequest, NextResponse } from "next/server";
import { getModel, rotateFallbackModel } from "@/lib/gemini";
import { Campaign } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaign: Campaign;
      messages: ChatMessage[];
    };

    const { campaign, messages } = body;

    // Build campaign context snapshot
    const campaignContext = `
You are an expert Amazon PPC assistant helping analyze a specific campaign.

## Campaign: ${campaign.name}
- Type: ${campaign.type} | Status: ${campaign.status}
- Daily Budget: $${campaign.dailyBudget.toFixed(2)} | Bid: $${campaign.bid.toFixed(2)}
- Bidding Strategy: ${campaign.biddingStrategy}
- Keyword: ${campaign.keyword || "N/A"} | Placement: ${campaign.placement || "N/A"}

## Current Period Performance
- Impressions: ${campaign.impressions?.toLocaleString() ?? 0}
- Clicks: ${campaign.clicks?.toLocaleString() ?? 0} (CTR: ${campaign.ctr?.toFixed(2) ?? 0}%)
- Orders: ${campaign.orders ?? 0} | Units: ${campaign.units ?? 0}
- Sales: $${campaign.sales?.toFixed(2) ?? 0} | Spend: $${campaign.spend?.toFixed(2) ?? 0}
- ACOS: ${campaign.acos?.toFixed(1) ?? 0}% | ROAS: ${campaign.roas?.toFixed(2) ?? 0}x
- CPC: $${campaign.cpc?.toFixed(2) ?? 0} | Conversion: ${campaign.conversion?.toFixed(1) ?? 0}%
- TOS Impression Share: ${campaign.tosIS > 0 ? campaign.tosIS.toFixed(1) + "%" : "N/A"}

## Previous Period Comparison
- Impressions: ${campaign.prevImpressions?.toLocaleString() ?? "N/A"}
- Clicks: ${campaign.prevClicks?.toLocaleString() ?? "N/A"}
- Orders: ${campaign.prevOrders ?? "N/A"}
- Sales: $${campaign.prevSales?.toFixed(2) ?? "N/A"} | Spend: $${campaign.prevSpend?.toFixed(2) ?? "N/A"}
- ACOS: ${campaign.prevAcos?.toFixed(1) ?? "N/A"}% | ROAS: ${campaign.prevRoas?.toFixed(2) ?? "N/A"}x

You are having a live chat conversation with the campaign manager about this specific campaign.
Be conversational, data-driven, and give specific actionable advice. 
Keep responses focused and concise (2-4 sentences unless more detail is genuinely needed).
Use numbers from the data above to support your points.
Respond in plain text — no markdown headers, no bullet point lists unless specifically asked.`;

    // Build conversation history for Gemini (it uses a single prompt approach)
    const conversationHistory = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = `${campaignContext}

## Conversation so far:
${conversationHistory || "(This is the start of the conversation)"}

${messages.length === 0
      ? "Assistant: (Provide an opening analysis of this campaign in 2-3 sentences, highlighting the most critical metric or issue. Start with the campaign name.)"
      : "Assistant: (Continue the conversation, directly answering the user's last message using the campaign data above.)"
    }`;

    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await getModel().generateContent(fullPrompt);
        break;
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes("429") || msg.includes("Too Many Requests")) {
          const canFallback = rotateFallbackModel();
          if (!canFallback || attempt === 2) {
            return NextResponse.json(
              { success: false, error: "Rate limit reached. Please wait a moment." },
              { status: 429 }
            );
          }
          continue;
        }
        throw err;
      }
    }

    if (!result) throw new Error("No response from Gemini");

    let text = result.response.text().trim();

    // Strip leading "Assistant:" prefix if present
    if (text.startsWith("Assistant:")) {
      text = text.slice("Assistant:".length).trim();
    }

    return NextResponse.json({ success: true, message: text });
  } catch (err) {
    console.error("[AI Chat Error]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
