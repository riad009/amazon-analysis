import { NextRequest, NextResponse } from "next/server";
import {
    isAmazonAdsConfigured,
    fetchCampaigns,
    fetchCampaignReport,
} from "@/lib/amazon-ads";
import { MOCK_CAMPAIGNS } from "@/lib/mock-data";
import { Campaign } from "@/lib/types";

// ─── Server-Side Cache ──────────────────────────────────────────────────────
// Campaigns list is cached in memory so subsequent page loads are instant.
// Cache is refreshed in the background when it's older than 5 minutes.

interface CachedData {
    campaigns: Campaign[];
    fetchedAt: number;
    source: "live" | "mock";
    metricsAvailable: boolean;
    dateKey: string; // "from|to" to invalidate on date change
}

let cache: CachedData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let backgroundRefreshInProgress = false;

function getCacheKey(from: string | null, to: string | null) {
    return `${from ?? ""}|${to ?? ""}`;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const phase = searchParams.get("phase") ?? "all";
    const dateKey = getCacheKey(from, to);

    // Not configured → mock data (instant)
    if (!isAmazonAdsConfigured()) {
        return NextResponse.json({
            success: true,
            source: "mock",
            phase,
            data: MOCK_CAMPAIGNS,
        });
    }

    // ── Check cache first (instant response!) ───────────────────────
    if (cache && cache.dateKey === dateKey) {
        const age = Date.now() - cache.fetchedAt;

        // Cache is fresh → return immediately
        if (age < CACHE_TTL) {
            console.log(`[Cache] HIT — ${cache.campaigns.length} campaigns, age ${Math.round(age / 1000)}s`);
            return NextResponse.json({
                success: true,
                source: cache.source,
                phase: "cached",
                metricsAvailable: cache.metricsAvailable,
                cached: true,
                cacheAge: Math.round(age / 1000),
                data: cache.campaigns,
            });
        }

        // Cache is stale → return it immediately, refresh in background
        if (!backgroundRefreshInProgress) {
            console.log(`[Cache] STALE — returning cached + starting background refresh`);
            triggerBackgroundRefresh(from, to, dateKey);
        }

        return NextResponse.json({
            success: true,
            source: cache.source,
            phase: "cached",
            metricsAvailable: cache.metricsAvailable,
            cached: true,
            cacheAge: Math.round(age / 1000),
            refreshing: true,
            data: cache.campaigns,
        });
    }

    // ── No cache for this date range → fetch fresh ──────────────────

    if (phase === "listing") {
        // Fast path: just campaign listing
        try {
            const rawCampaigns = await fetchCampaigns();
            console.log(`[Amazon] Fetched ${rawCampaigns.length} campaigns (listing only)`);

            const campaigns = rawCampaigns.map((rc) => mapCampaign(rc, null, null));

            // Save to cache (without metrics)
            cache = {
                campaigns,
                fetchedAt: Date.now(),
                source: "live",
                metricsAvailable: false,
                dateKey,
            };

            // Start background metrics fetch
            triggerBackgroundRefresh(from, to, dateKey);

            return NextResponse.json({
                success: true,
                source: "live",
                phase: "listing",
                metricsAvailable: false,
                data: campaigns,
            });
        } catch (err) {
            console.error("[Amazon] Campaign listing failed:", err);
            return NextResponse.json({
                success: true,
                source: "mock",
                phase: "listing",
                error: String(err),
                data: MOCK_CAMPAIGNS,
            });
        }
    }

    // Full fetch (listing + metrics)
    return await fetchFullAndRespond(from, to, dateKey, phase);
}

// ─── Background Refresh ─────────────────────────────────────────────────────

function triggerBackgroundRefresh(from: string | null, to: string | null, dateKey: string) {
    if (backgroundRefreshInProgress) return;
    backgroundRefreshInProgress = true;

    // Fire and forget
    fetchFullData(from, to, dateKey)
        .then((result) => {
            if (result) {
                cache = result;
                console.log(`[Cache] Background refresh complete — ${result.campaigns.length} campaigns, metrics=${result.metricsAvailable}`);
            }
        })
        .catch((err) => console.error("[Cache] Background refresh failed:", err))
        .finally(() => { backgroundRefreshInProgress = false; });
}

async function fetchFullData(
    from: string | null,
    to: string | null,
    dateKey: string
): Promise<CachedData | null> {
    try {
        const rawCampaigns = await fetchCampaigns();

        type ReportRow = Awaited<ReturnType<typeof fetchCampaignReport>>[number];
        let report: ReportRow[] = [];
        let prevReport: ReportRow[] = [];
        let metricsAvailable = false;

        if (from && to) {
            try {
                report = await fetchCampaignReport(from, to);
                metricsAvailable = true;
                console.log(`[Amazon] Report: ${report.length} rows`);

                try {
                    const fromDate = new Date(from);
                    const toDate = new Date(to);
                    const duration = toDate.getTime() - fromDate.getTime();
                    const prevTo = new Date(fromDate.getTime() - 86400000);
                    const prevFrom = new Date(prevTo.getTime() - duration);
                    prevReport = await fetchCampaignReport(
                        prevFrom.toISOString().split("T")[0],
                        prevTo.toISOString().split("T")[0]
                    );
                } catch {
                    // Comparison is best-effort
                }
            } catch (reportErr) {
                console.warn("[Amazon] Report unavailable:", reportErr);
            }
        }

        const metricsMap = new Map(report.map((r) => [String(r.campaignId), r]));
        const prevMetricsMap = new Map(prevReport.map((r) => [String(r.campaignId), r]));

        const campaigns = rawCampaigns.map((rc) => {
            const id = String(rc.campaignId);
            return mapCampaign(rc, metricsMap.get(id) ?? null, prevMetricsMap.get(id) ?? null);
        });

        return { campaigns, fetchedAt: Date.now(), source: "live", metricsAvailable, dateKey };
    } catch {
        return null;
    }
}

async function fetchFullAndRespond(
    from: string | null,
    to: string | null,
    dateKey: string,
    phase: string
) {
    const result = await fetchFullData(from, to, dateKey);

    if (result) {
        cache = result;
        return NextResponse.json({
            success: true,
            source: "live",
            phase,
            metricsAvailable: result.metricsAvailable,
            data: result.campaigns,
        });
    }

    return NextResponse.json({
        success: true,
        source: "mock",
        phase,
        data: MOCK_CAMPAIGNS,
    });
}

// ─── Campaign Mapper ────────────────────────────────────────────────────────

interface RawCampaignLike {
    campaignId: number;
    name: string;
    state: string;
    budget?: { budget: number; budgetType: string };
    startDate?: string;
    dynamicBidding?: { strategy: string };
    targetingType?: string;
}

interface MetricsLike {
    impressions: number;
    clicks: number;
    cost: number;
    purchases7d: number;
    unitsSoldClicks7d: number;
    sales7d: number;
}

function mapCampaign(rc: RawCampaignLike, m: MetricsLike | null, pm: MetricsLike | null): Campaign {
    const id = String(rc.campaignId);
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    const orders = m?.purchases7d ?? 0;
    const units = m?.unitsSoldClicks7d ?? 0;
    const sales = m?.sales7d ?? 0;
    const spend = m?.cost ?? 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const acos = sales > 0 ? (spend / sales) * 100 : 0;
    const roas = spend > 0 ? sales / spend : 0;
    const conversion = clicks > 0 ? (orders / clicks) * 100 : 0;

    const prevSales = pm?.sales7d;
    const prevSpend = pm?.cost;
    const prevAcos = prevSales && prevSpend && prevSales > 0 ? (prevSpend / prevSales) * 100 : undefined;
    const prevRoas = prevSpend && prevSales && prevSpend > 0 ? prevSales / prevSpend : undefined;

    const status = rc.state === "ENABLED" ? "Enabled" : rc.state === "PAUSED" ? "Paused" : "Archived";
    const strategyMap: Record<string, Campaign["biddingStrategy"]> = {
        LEGACY_FOR_SALES: "Fixed Bid", AUTO_FOR_SALES: "Dynamic Bids - Down Only", MANUAL: "Fixed Bid",
    };

    return {
        id,
        name: rc.name,
        type: rc.targetingType === "AUTO" ? "SP Auto" : "SP Manual",
        status,
        dailyBudget: rc.budget?.budget ?? 0,
        startDate: rc.startDate ?? "",
        biddingStrategy: strategyMap[rc.dynamicBidding?.strategy ?? ""] ?? "Fixed Bid",
        portfolio: "",
        productIds: [],
        impressions, clicks, orders, units,
        sales: Math.round(sales * 100) / 100,
        conversion: Math.round(conversion * 100) / 100,
        spend: Math.round(spend * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        acos: Math.round(acos * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        prevImpressions: pm?.impressions,
        prevClicks: pm?.clicks,
        prevOrders: pm?.purchases7d,
        prevSales: prevSales != null ? Math.round(prevSales * 100) / 100 : undefined,
        prevSpend: prevSpend != null ? Math.round(prevSpend * 100) / 100 : undefined,
        prevAcos: prevAcos != null ? Math.round(prevAcos * 100) / 100 : undefined,
        prevRoas: prevRoas != null ? Math.round(prevRoas * 100) / 100 : undefined,
        aiSuggestions: [],
    };
}
