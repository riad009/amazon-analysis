import { NextRequest, NextResponse } from "next/server";
import { fetchPlacementReport } from "@/lib/amazon-ads";
import { getDefaultProfileId, isAmazonAdsConfigured } from "@/lib/amazon-ads";
import type { PlacementMetrics } from "@/lib/types";

// ─── In-memory cache ─────────────────────────────────────────────────────────
const placementCache = new Map<string, { data: PlacementMetrics[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function mapPlacementName(raw: string): PlacementMetrics["placement"] {
    if (raw.toLowerCase().includes("top of search")) return "Top of Search";
    if (raw.toLowerCase().includes("detail page") || raw.toLowerCase().includes("product page")) return "Product Page";
    return "Rest of Search";
}

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

    // Check cache
    const cacheKey = `${profileId}|${campaignId}|${from}|${to}`;
    const cached = placementCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return NextResponse.json({ success: true, source: "cache", data: cached.data });
    }

    try {
        const rawRows = await fetchPlacementReport(campaignId, from, to, profileId);

        // Map raw rows to PlacementMetrics
        const placements: PlacementMetrics[] = rawRows.map((row) => {
            const impressions = Number(row.impressions ?? 0);
            const clicks = Number(row.clicks ?? 0);
            const spend = Number(row.cost ?? 0);
            const orders = Number(row.purchases7d ?? 0);
            const units = Number(row.unitsSoldClicks7d ?? 0);
            const sales = Number(row.sales7d ?? 0);
            const cpc = clicks > 0 ? spend / clicks : 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const acos = sales > 0 ? (spend / sales) * 100 : 0;
            const roas = spend > 0 ? sales / spend : 0;
            const conversion = clicks > 0 ? (orders / clicks) * 100 : 0;

            return {
                placement: mapPlacementName(row.placementClassification ?? ""),
                impressions,
                clicks,
                orders,
                units,
                sales: Math.round(sales * 100) / 100,
                spend: Math.round(spend * 100) / 100,
                cpc: Math.round(cpc * 100) / 100,
                ctr: Math.round(ctr * 100) / 100,
                acos: Math.round(acos * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                conversion: Math.round(conversion * 100) / 100,
            };
        });

        // Ensure all 3 placements exist (fill missing with zeros)
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

        // Sort by impressions descending (most impressions first)
        result.sort((a, b) => b.impressions - a.impressions);

        // Cache the result
        placementCache.set(cacheKey, { data: result, fetchedAt: Date.now() });

        return NextResponse.json({ success: true, source: "live", data: result });
    } catch (err) {
        console.error("[Placements API] Error:", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
