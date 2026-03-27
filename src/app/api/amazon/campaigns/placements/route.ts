import { NextRequest, NextResponse } from "next/server";
import { getDefaultProfileId, isAmazonAdsConfigured } from "@/lib/amazon-ads";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import type { PlacementMetrics } from "@/lib/types";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const profileId = searchParams.get("profileId") ?? getDefaultProfileId() ?? "";

    if (!campaignId || !from || !to) {
        return NextResponse.json(
            { success: false, error: "Missing required params: campaignId, from, to" },
            { status: 400 }
        );
    }

    if (!isAmazonAdsConfigured()) {
        return NextResponse.json(
            { success: false, error: "Amazon Ads API credentials not configured." },
            { status: 500 }
        );
    }

    try {
        await connectDB();
        const { DailyPlacementMetrics } = getProfileModels(profileId);

        // Aggregate placement metrics from MongoDB for the date range
        const placementAgg = await DailyPlacementMetrics.aggregate([
            {
                $match: {
                    profileId,
                    campaignId,
                    date: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: "$placement",
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    cost: { $sum: "$cost" },
                    orders: { $sum: "$orders" },
                    units: { $sum: "$units" },
                    sales: { $sum: "$sales" },
                },
            },
        ]);

        // Map to PlacementMetrics
        const placements: PlacementMetrics[] = placementAgg.map((row) => {
            const impressions = Number(row.impressions ?? 0);
            const clicks = Number(row.clicks ?? 0);
            const spend = Number(row.cost ?? 0);
            const orders = Number(row.orders ?? 0);
            const units = Number(row.units ?? 0);
            const sales = Number(row.sales ?? 0);
            const cpc = clicks > 0 ? spend / clicks : 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const acos = sales > 0 ? (spend / sales) * 100 : 0;
            const roas = spend > 0 ? sales / spend : 0;
            const conversion = clicks > 0 ? (orders / clicks) * 100 : 0;

            return {
                placement: row._id as PlacementMetrics["placement"],
                impressions, clicks, orders, units,
                sales: Math.round(sales * 100) / 100,
                spend: Math.round(spend * 100) / 100,
                cpc: Math.round(cpc * 100) / 100,
                ctr: Math.round(ctr * 100) / 100,
                acos: Math.round(acos * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                conversion: Math.round(conversion * 100) / 100,
            };
        });

        // Ensure all 3 placements exist
        const allPlacements: PlacementMetrics["placement"][] = ["Top of Search", "Product Page", "Rest of Search"];
        const result: PlacementMetrics[] = allPlacements.map((p) => {
            const existing = placements.find((pm) => pm.placement === p);
            if (existing) return existing;
            return {
                placement: p,
                impressions: 0, clicks: 0, orders: 0, units: 0,
                sales: 0, spend: 0, cpc: 0, ctr: 0, acos: 0, roas: 0, conversion: 0,
            };
        });

        result.sort((a, b) => b.impressions - a.impressions);

        return NextResponse.json({ success: true, source: "mongodb", data: result });
    } catch (err) {
        console.error("[Placements API] Error:", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
