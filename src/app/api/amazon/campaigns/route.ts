import { NextRequest, NextResponse } from "next/server";
import {
    isAmazonAdsConfigured,
    getDefaultProfileId,
    updateCampaign,
    updateKeywordBid,
} from "@/lib/amazon-ads";
import { Campaign, PlacementMetrics } from "@/lib/types";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";

// ─── GET: Campaign data — reads ONLY from MongoDB (instant) ──────────────────
// Campaign structure is stored by fetch-metrics / crons.
// Metrics are stored per-day in DailyMetrics.
// No Amazon API calls happen here.

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const profileId = searchParams.get("profileId") ?? getDefaultProfileId() ?? "";

    try {
        await connectDB();

        const { DailyMetrics, DailyPlacementMetrics, CampaignStructure, FetchLog } = getProfileModels(profileId);

        // ── Step 1: Read campaign structure from MongoDB ──
        const structures = await CampaignStructure.find({ profileId }).lean();

        // Get last successful fetch timestamp
        const lastFetch = await FetchLog.findOne(
            { profileId, status: "success" },
            { fetchedAt: 1 },
            { sort: { fetchedAt: -1 } }
        ).lean();
        const dataUpdatedAt = lastFetch?.fetchedAt?.toISOString() ?? null;

        if (structures.length === 0) {
            return NextResponse.json({
                success: true,
                source: "db",
                metricsAvailable: false,
                metricsDays: 0,
                expectedDays: 0,
                data: [],
                placementData: {},
                dataUpdatedAt,
                message: "No campaign data yet. Go to Manage Data to fetch from Amazon.",
            });
        }

        // ── Step 2: Read aggregated metrics from MongoDB ──
        let metricsMap = new Map<string, { impressions: number; clicks: number; cost: number; orders: number; units: number; sales: number }>();
        let placementData: Record<string, PlacementMetrics[]> = {};
        let metricsAvailable = false;
        let daysWithMetrics = 0;
        let expectedDays = 0;

        if (from && to) {
            expectedDays = Math.min(
                Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1,
                31
            );

            const metricsAgg = await DailyMetrics.aggregate([
                { $match: { profileId, date: { $gte: from, $lte: to } } },
                {
                    $group: {
                        _id: "$campaignId",
                        impressions: { $sum: "$impressions" },
                        clicks: { $sum: "$clicks" },
                        cost: { $sum: "$cost" },
                        orders: { $sum: "$orders" },
                        units: { $sum: "$units" },
                        sales: { $sum: "$sales" },
                    },
                },
            ]);

            for (const row of metricsAgg) {
                metricsMap.set(row._id, {
                    impressions: row.impressions,
                    clicks: row.clicks,
                    cost: row.cost,
                    orders: row.orders,
                    units: row.units,
                    sales: row.sales,
                });
            }

            metricsAvailable = metricsAgg.length > 0;

            daysWithMetrics = metricsAvailable
                ? (await DailyMetrics.distinct("date", { profileId, date: { $gte: from, $lte: to } })).length
                : 0;

            const placementAgg = await DailyPlacementMetrics.aggregate([
                { $match: { profileId, date: { $gte: from, $lte: to } } },
                {
                    $group: {
                        _id: { campaignId: "$campaignId", placement: "$placement" },
                        impressions: { $sum: "$impressions" },
                        clicks: { $sum: "$clicks" },
                        cost: { $sum: "$cost" },
                        orders: { $sum: "$orders" },
                        units: { $sum: "$units" },
                        sales: { $sum: "$sales" },
                    },
                },
            ]);

            placementData = buildPlacementDataMap(placementAgg);
        }

        // ── Step 3: Merge structure + metrics → Campaign objects ──
        const campaigns: Campaign[] = structures.map((s) => {
            const id = String(s.campaignId);
            const m = metricsMap.get(id);
            const impressions = m?.impressions ?? 0;
            const clicks = m?.clicks ?? 0;
            const orders = m?.orders ?? 0;
            const units = m?.units ?? 0;
            const sales = m?.sales ?? 0;
            const spend = m?.cost ?? 0;
            const cpc = clicks > 0 ? spend / clicks : 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const acos = sales > 0 ? (spend / sales) * 100 : 0;
            const roas = spend > 0 ? sales / spend : 0;
            const conversion = clicks > 0 ? (orders / clicks) * 100 : 0;

            return {
                id,
                name: s.name,
                type: s.type as Campaign["type"],
                status: s.status as Campaign["status"],
                dailyBudget: s.dailyBudget,
                startDate: s.startDate,
                biddingStrategy: s.biddingStrategy as Campaign["biddingStrategy"],
                portfolio: s.portfolio,
                productIds: [],
                impressions, clicks, orders, units,
                sales: Math.round(sales * 100) / 100,
                conversion: Math.round(conversion * 100) / 100,
                spend: Math.round(spend * 100) / 100,
                cpc: Math.round(cpc * 100) / 100,
                ctr: Math.round(ctr * 100) / 100,
                acos: Math.round(acos * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                keyword: s.keyword,
                bid: s.bid,
                keywordId: s.keywordId || undefined,
                placement: s.placement as Campaign["placement"],
                placementBidTOS: s.placementBidTOS,
                placementBidPP: s.placementBidPP,
                tosIS: 0,
                aiSuggestions: [],
            };
        });

        console.log(`[Route] ✅ ${campaigns.length} campaigns from DB (metrics=${metricsAvailable}, days=${daysWithMetrics}/${expectedDays})`);

        return NextResponse.json({
            success: true,
            source: "db",
            metricsAvailable,
            metricsDays: daysWithMetrics,
            expectedDays,
            data: campaigns,
            placementData,
            dataUpdatedAt,
        });
    } catch (err) {
        console.error("[Route] Error:", err);
        return NextResponse.json({
            success: false, source: "error",
            error: String(err), data: [],
        }, { status: 500 });
    }
}

// ─── Placement Data Builder ─────────────────────────────────────────────────

interface PlacementAggRow {
    _id: { campaignId: string; placement: string };
    impressions: number;
    clicks: number;
    cost: number;
    orders: number;
    units: number;
    sales: number;
}

function buildPlacementDataMap(rows: PlacementAggRow[]): Record<string, PlacementMetrics[]> {
    const map: Record<string, PlacementAggRow[]> = {};
    for (const row of rows) {
        const cid = row._id.campaignId;
        if (!map[cid]) map[cid] = [];
        map[cid].push(row);
    }

    const result: Record<string, PlacementMetrics[]> = {};
    const allPlacements: PlacementMetrics["placement"][] = ["Top of Search", "Product Page", "Rest of Search"];

    for (const [cid, cRows] of Object.entries(map)) {
        const mapped = cRows.map((row) => {
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
                placement: row._id.placement as PlacementMetrics["placement"],
                impressions, clicks, orders, units,
                sales: Math.round(sales * 100) / 100,
                spend: Math.round(spend * 100) / 100,
                cpc: Math.round(cpc * 100) / 100,
                ctr: Math.round(ctr * 100) / 100,
                acos: Math.round(acos * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                conversion: Math.round(conversion * 100) / 100,
            } as PlacementMetrics;
        });

        const filled = allPlacements.map((p) => {
            const existing = mapped.find((m) => m.placement === p);
            if (existing) return existing;
            return { placement: p, impressions: 0, clicks: 0, orders: 0, units: 0, sales: 0, spend: 0, cpc: 0, ctr: 0, acos: 0, roas: 0, conversion: 0 } as PlacementMetrics;
        });

        filled.sort((a, b) => b.impressions - a.impressions);
        result[cid] = filled;
    }

    return result;
}



// ─── PUT: Update a campaign field ───────────────────────────────────────────

const VALID_STRATEGIES = ["Fixed Bid", "Dynamic Bids - Down Only", "Dynamic Bids - Up and Down"];

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { campaignId, field, value, keywordId, profileId: reqProfileId } = body;
        const profileId = reqProfileId || getDefaultProfileId() || "";

        if (!campaignId || !field) {
            return NextResponse.json(
                { success: false, error: "Missing campaignId or field" },
                { status: 400 }
            );
        }

        if (!isAmazonAdsConfigured()) {
            return NextResponse.json(
                { success: false, error: "Amazon Ads API credentials not configured." },
                { status: 500 }
            );
        }

        // Validate and dispatch
        switch (field) {
            case "dailyBudget": {
                const budget = Number(value);
                if (isNaN(budget) || budget <= 0) {
                    return NextResponse.json(
                        { success: false, error: "Budget must be a positive number" },
                        { status: 400 }
                    );
                }
                const result = await updateCampaign(
                    { campaignId, budget: Math.round(budget * 100) / 100 },
                    profileId
                );
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, field, value: Math.round(budget * 100) / 100 });
            }

            case "status": {
                const statusMap: Record<string, "ENABLED" | "PAUSED"> = {
                    Enabled: "ENABLED",
                    Paused: "PAUSED",
                };
                const apiStatus = statusMap[value];
                if (!apiStatus) {
                    return NextResponse.json(
                        { success: false, error: "Status must be 'Enabled' or 'Paused'" },
                        { status: 400 }
                    );
                }
                const result = await updateCampaign(
                    { campaignId, status: apiStatus },
                    profileId
                );
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, field, value });
            }

            case "biddingStrategy": {
                if (!VALID_STRATEGIES.includes(value)) {
                    return NextResponse.json(
                        { success: false, error: `Invalid bidding strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}` },
                        { status: 400 }
                    );
                }
                const result = await updateCampaign(
                    { campaignId, biddingStrategy: value },
                    profileId
                );
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, field, value });
            }

            case "bid": {
                const bid = Number(value);
                if (isNaN(bid) || bid < 0.02) {
                    return NextResponse.json(
                        { success: false, error: "Bid must be at least $0.02" },
                        { status: 400 }
                    );
                }
                if (!keywordId) {
                    return NextResponse.json(
                        { success: false, error: "keywordId is required for bid updates" },
                        { status: 400 }
                    );
                }
                const result = await updateKeywordBid(
                    keywordId,
                    Math.round(bid * 100) / 100,
                    profileId
                );
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, field, value: Math.round(bid * 100) / 100 });
            }

            default:
                return NextResponse.json(
                    { success: false, error: `Field '${field}' is not editable` },
                    { status: 400 }
                );
        }
    } catch (err) {
        console.error("[Route PUT] Error:", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
