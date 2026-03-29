import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import { CampaignHistory } from "@/lib/models/campaign-history";
import { updateCampaign, updateKeywordBid, isAmazonAdsConfigured } from "@/lib/amazon-ads";

// ─── POST: Update a campaign field (budget, bid, status, biddingStrategy) ───
// Also logs the change to CampaignHistory for audit trail.

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { profileId, campaignId, field, value, user, extra } = body;

    if (!profileId || !campaignId || !field || value === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (profileId, campaignId, field, value)" },
        { status: 400 }
      );
    }

    const VALID_FIELDS = ["dailyBudget", "bid", "status", "biddingStrategy"];
    if (!VALID_FIELDS.includes(field)) {
      return NextResponse.json(
        { success: false, error: `Invalid field: ${field}. Must be one of: ${VALID_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }

    const changedBy = user || "unknown";
    const { CampaignStructure } = getProfileModels(profileId);

    // Find the campaign in our DB
    const campaign = await CampaignStructure.findOne({ profileId, campaignId });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found in database" },
        { status: 404 }
      );
    }

    const oldValue = (campaign as Record<string, unknown>)[field];

    // Skip if value is unchanged
    if (String(oldValue) === String(value)) {
      return NextResponse.json({ success: true, message: "No change needed" });
    }

    // Update on Amazon API first — this is the source of truth
    if (isAmazonAdsConfigured()) {
      let updateResult: { success: boolean; error?: string } = { success: true };

      if (field === "bid" && extra?.keywordId) {
        updateResult = await updateKeywordBid(extra.keywordId, Number(value), profileId);
      } else if (field === "dailyBudget") {
        updateResult = await updateCampaign({ campaignId, budget: Number(value) }, profileId);
      } else if (field === "status") {
        const statusMap: Record<string, "ENABLED" | "PAUSED"> = {
          Enabled: "ENABLED",
          Paused: "PAUSED",
        };
        updateResult = await updateCampaign(
          { campaignId, status: statusMap[String(value)] || "ENABLED" },
          profileId
        );
      } else if (field === "biddingStrategy") {
        updateResult = await updateCampaign(
          { campaignId, biddingStrategy: String(value) },
          profileId
        );
      }

      if (!updateResult.success) {
        console.error(`[Campaign Update] ❌ Amazon API rejected update: ${updateResult.error}`);
        return NextResponse.json(
          { success: false, error: updateResult.error || "Amazon API update failed" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Amazon Ads API is not configured. Cannot update." },
        { status: 503 }
      );
    }

    // Amazon API succeeded — now sync our local DB to match
    (campaign as Record<string, unknown>)[field] = value;
    await campaign.save();

    // Log the change for audit history
    await CampaignHistory.create({
      profileId,
      campaignId,
      field,
      oldValue: oldValue ?? "",
      newValue: value,
      changedBy,
      changedAt: new Date(),
    });

    console.log(`[Campaign Update] ✅ ${field}: ${oldValue} → ${value} (campaign=${campaignId}, by=${changedBy})`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Campaign Update] Error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
