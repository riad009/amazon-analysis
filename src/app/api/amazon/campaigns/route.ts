import { NextRequest, NextResponse } from "next/server";
import {
    isAmazonAdsConfigured,
    getDefaultProfileId,
    fetchCampaigns,
    fetchCampaignReport,
    fetchKeywords,
    fetchPortfolios,
    fetchPlacementReport,
} from "@/lib/amazon-ads";
import type { PlacementReportRow } from "@/lib/amazon-ads";
import type { RawKeyword } from "@/lib/amazon-ads";
import { Campaign, PlacementMetrics } from "@/lib/types";
import fs from "fs";
import path from "path";

// ─── File Cache ─────────────────────────────────────────────────────────────
// Each date range gets its own JSON cache file for instant loading.

const CACHE_DIR = process.env.VERCEL
    ? path.join("/tmp", ".cache")
    : path.join(process.cwd(), ".cache");

interface CachedData {
    campaigns: Campaign[];
    placementData?: Record<string, PlacementMetrics[]>; // campaignId -> placements
    fetchedAt: number;
    source: "live";
    metricsAvailable: boolean;
    dateKey: string;
}

// In-memory cache (fastest)
const memCacheMap = new Map<string, CachedData>();

// Deduplication: if a fetch is already running for a dateKey, reuse the same promise
const inFlightFetches = new Map<string, Promise<CachedData | null>>();

/** Clear all caches (called from cache-status DELETE) */
export function clearMemoryCache() {
    memCacheMap.clear();
    console.log("[Cache] 🧹 Memory cache cleared");
}

function getCacheKey(from: string | null, to: string | null, profileId: string | null) {
    return `${profileId ?? ""}|${from ?? ""}|${to ?? ""}`;
}

function getCacheFilePath(dateKey: string) {
    const safeName = dateKey.replace(/\|/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    return path.join(CACHE_DIR, `campaigns_${safeName}.json`);
}

function saveCacheToFile(data: CachedData) {
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        const filePath = getCacheFilePath(data.dateKey);
        fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
        console.log(`[Cache] 💾 Saved ${data.campaigns.length} campaigns to ${path.basename(filePath)} (metrics=${data.metricsAvailable})`);
    } catch (err) {
        console.warn("[Cache] Failed to save:", err);
    }
}

function loadCacheFromFile(dateKey: string): CachedData | null {
    try {
        const filePath = getCacheFilePath(dateKey);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as CachedData;
        console.log(`[Cache] 📂 Loaded ${data.campaigns.length} campaigns from ${path.basename(filePath)} (metrics=${data.metricsAvailable})`);
        return data;
    } catch (err) {
        console.warn("[Cache] Failed to load:", err);
        return null;
    }
}

/** Find the best fallback cache file for a given profileId (must have metrics) */
function findBestFallbackCache(profileId: string): CachedData | null {
    try {
        if (!fs.existsSync(CACHE_DIR)) return null;
        const files = fs.readdirSync(CACHE_DIR)
            .filter((f: string) => f.startsWith("campaigns_") && f.endsWith(".json"))
            .sort((a: string, b: string) => {
                // Sort by modification time descending (most recent first)
                const aStat = fs.statSync(path.join(CACHE_DIR, a));
                const bStat = fs.statSync(path.join(CACHE_DIR, b));
                return bStat.mtimeMs - aStat.mtimeMs;
            });

        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(CACHE_DIR, file), "utf-8");
                const data = JSON.parse(raw) as CachedData;

                // Must have metrics and match the same profile
                if (!data.metricsAvailable) continue;
                const cacheProfile = data.dateKey.split("|")[0];
                if (cacheProfile && profileId && cacheProfile !== profileId) continue;

                console.log(`[Cache] 🔍 Found fallback: ${file} (${data.campaigns.length} campaigns, metrics=${data.metricsAvailable})`);
                return data;
            } catch {
                continue;
            }
        }
    } catch (err) {
        console.warn("[Cache] Fallback scan failed:", err);
    }
    return null;
}

// ─── Route Handler ──────────────────────────────────────────────────────────
// Two phases:
//   phase=listing → return cache instantly (or fetch listing if no cache)
//   phase=all     → fetch fresh data from API with metrics, save to cache, return

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const phase = searchParams.get("phase") ?? "all";
    const profileId = searchParams.get("profileId") ?? getDefaultProfileId() ?? "";
    const dateKey = getCacheKey(from, to, profileId);

    if (!isAmazonAdsConfigured()) {
        return NextResponse.json({
            success: false, source: "error",
            error: "Amazon Ads API credentials not configured.",
            data: [],
        }, { status: 500 });
    }

    // ── phase=all → Fetch FRESH data from Amazon API (blocks until done) ──
    if (phase === "all") {
        // Deduplicate: if already fetching this dateKey, reuse the same promise
        let fetchPromise = inFlightFetches.get(dateKey);
        if (fetchPromise) {
            console.log(`[Route] phase=all — reusing in-flight fetch for ${dateKey}`);
        } else {
            console.log(`[Route] phase=all — fetching fresh from API (profile=${profileId})...`);
            fetchPromise = fetchFullData(from, to, dateKey, profileId).finally(() => {
                inFlightFetches.delete(dateKey);
            });
            inFlightFetches.set(dateKey, fetchPromise);
        }

        try {
            const result = await fetchPromise;
            if (result) {
                memCacheMap.set(dateKey, result);
                saveCacheToFile(result);
                console.log(`[Route] ✅ Fresh data ready — ${result.campaigns.length} campaigns, metrics=${result.metricsAvailable}`);
                return NextResponse.json({
                    success: true, source: "live", phase: "all",
                    metricsAvailable: result.metricsAvailable,
                    data: result.campaigns,
                    placementData: result.placementData ?? {},
                });
            }
            throw new Error("No data returned");
        } catch (err) {
            console.error("[Route] phase=all failed:", err);
            return NextResponse.json({
                success: false, source: "error", phase: "all",
                error: String(err), data: [],
            }, { status: 500 });
        }
    }

    // ── phase=listing → Return cache instantly ────────────────────────────

    // 1. Memory cache (fastest)
    const memCache = memCacheMap.get(dateKey);
    if (memCache) {
        console.log(`[Cache] MEM HIT — ${memCache.campaigns.length} campaigns, metrics=${memCache.metricsAvailable}`);
        return NextResponse.json({
            success: true, source: "live", phase: "cached",
            metricsAvailable: memCache.metricsAvailable,
            cached: true,
            data: memCache.campaigns,
            placementData: memCache.placementData ?? {},
        });
    }

    // 2. File cache (on server restart)
    const fileCache = loadCacheFromFile(dateKey);
    if (fileCache && fileCache.campaigns.length > 0) {
        memCacheMap.set(dateKey, fileCache);
        console.log(`[Cache] FILE HIT — ${fileCache.campaigns.length} campaigns, metrics=${fileCache.metricsAvailable}`);
        return NextResponse.json({
            success: true, source: "live", phase: "cached",
            metricsAvailable: fileCache.metricsAvailable,
            cached: true,
            data: fileCache.campaigns,
            placementData: fileCache.placementData ?? {},
        });
    }

    // 2.5. Fallback: find ANY cache file for the same profile that has metrics
    //      This prevents "Loading..." every day when the date range shifts by 1 day.
    const fallbackCache = findBestFallbackCache(profileId);
    if (fallbackCache && fallbackCache.campaigns.length > 0) {
        // Store in memory under CURRENT dateKey so subsequent requests are instant
        const adapted: CachedData = { ...fallbackCache, dateKey };
        memCacheMap.set(dateKey, adapted);
        console.log(`[Cache] FALLBACK HIT — using ${fallbackCache.dateKey} cache (${fallbackCache.campaigns.length} campaigns, metrics=${fallbackCache.metricsAvailable})`);
        return NextResponse.json({
            success: true, source: "live", phase: "cached",
            metricsAvailable: fallbackCache.metricsAvailable,
            cached: true,
            data: fallbackCache.campaigns,
            placementData: fallbackCache.placementData ?? {},
        });
    }

    // 3. No cache at all → fetch listing (campaigns only, no report)
    console.log(`[Route] No cache — fetching listing (profile=${profileId})...`);
    try {
        const [rawCampaigns, portfolios, keywords] = await Promise.all([
            fetchCampaigns(profileId),
            fetchPortfolios(profileId).catch(() => []),
            fetchKeywords(profileId).catch(() => [] as RawKeyword[]),
        ]);

        const portfolioMap = new Map<string, string>();
        for (const p of portfolios) portfolioMap.set(String(p.portfolioId), p.name);

        const keywordMap = new Map<string, RawKeyword[]>();
        for (const kw of keywords) {
            const cid = String(kw.campaignId);
            if (!keywordMap.has(cid)) keywordMap.set(cid, []);
            keywordMap.get(cid)!.push(kw);
        }

        const campaigns = rawCampaigns.map((rc) =>
            mapCampaign(rc, null, null, keywordMap.get(String(rc.campaignId)) ?? [], portfolioMap)
        );

        const cacheData: CachedData = {
            campaigns, fetchedAt: Date.now(), source: "live",
            metricsAvailable: false, dateKey,
        };
        memCacheMap.set(dateKey, cacheData);
        // NOTE: Don't save listing-only data (no metrics) to file cache.
        // Only phase=all saves to file, so we never persist metricsAvailable:false
        // which would cause "Loading..." to show on every page reload.

        return NextResponse.json({
            success: true, source: "live", phase: "listing",
            metricsAvailable: false, data: campaigns,
        });
    } catch (err) {
        console.error("[Route] Listing failed:", err);
        return NextResponse.json({
            success: false, source: "error", phase: "listing",
            error: String(err), data: [],
        }, { status: 500 });
    }
}

// ─── Fetch Full Data (campaigns + portfolios + keywords + report) ───────────

async function fetchFullData(
    from: string | null,
    to: string | null,
    dateKey: string,
    profileId?: string
): Promise<CachedData | null> {
    const [rawCampaigns, keywords, portfolios] = await Promise.all([
        fetchCampaigns(profileId),
        fetchKeywords(profileId).catch(() => [] as RawKeyword[]),
        fetchPortfolios(profileId).catch(() => []),
    ]);

    const portfolioMap = new Map<string, string>();
    for (const p of portfolios) portfolioMap.set(String(p.portfolioId), p.name);

    const keywordMap = new Map<string, RawKeyword[]>();
    for (const kw of keywords) {
        const cid = String(kw.campaignId);
        if (!keywordMap.has(cid)) keywordMap.set(cid, []);
        keywordMap.get(cid)!.push(kw);
    }

    type ReportRow = Awaited<ReturnType<typeof fetchCampaignReport>>[number];
    let report: ReportRow[] = [];
    let placementRows: PlacementReportRow[] = [];
    let metricsAvailable = false;

    if (from && to) {
        // Fetch campaign report AND placement report in parallel
        const [reportResult, placementResult] = await Promise.allSettled([
            fetchCampaignReport(from, to, profileId),
            fetchPlacementReport("__all__", from, to, profileId),
        ]);

        if (reportResult.status === "fulfilled") {
            report = reportResult.value;
            metricsAvailable = true;
            console.log(`[API] Campaign report: ${report.length} rows with metrics`);
        } else {
            console.warn("[API] Campaign report failed:", reportResult.reason);
        }

        if (placementResult.status === "fulfilled") {
            placementRows = placementResult.value;
            console.log(`[API] Placement report: ${placementRows.length} rows`);
        } else {
            console.warn("[API] Placement report failed:", placementResult.reason);
        }
    }

    const metricsMap = new Map(report.map((r) => [String(r.campaignId), r]));

    // Build placement data map: campaignId -> PlacementMetrics[]
    const placementData = buildPlacementDataMap(placementRows);

    const campaigns = rawCampaigns.map((rc) => {
        const id = String(rc.campaignId);
        return mapCampaign(rc, metricsMap.get(id) ?? null, null, keywordMap.get(id) ?? [], portfolioMap);
    });

    return { campaigns, placementData, fetchedAt: Date.now(), source: "live", metricsAvailable, dateKey };
}

// ─── Placement Data Builder ─────────────────────────────────────────────────

function mapPlacementName(raw: string): PlacementMetrics["placement"] {
    if (raw.toLowerCase().includes("top of search")) return "Top of Search";
    if (raw.toLowerCase().includes("detail page") || raw.toLowerCase().includes("product page")) return "Product Page";
    return "Rest of Search";
}

function buildPlacementDataMap(rows: PlacementReportRow[]): Record<string, PlacementMetrics[]> {
    const map: Record<string, PlacementReportRow[]> = {};
    for (const row of rows) {
        const cid = String(row.campaignId);
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

        // Ensure all 3 placements exist
        const filled = allPlacements.map((p) => {
            const existing = mapped.find((m) => m.placement === p);
            if (existing) return existing;
            return { placement: p, impressions: 0, clicks: 0, orders: 0, units: 0, sales: 0, spend: 0, cpc: 0, ctr: 0, acos: 0, roas: 0, conversion: 0 } as PlacementMetrics;
        });

        // Sort by impressions descending
        filled.sort((a, b) => b.impressions - a.impressions);
        result[cid] = filled;
    }

    return result;
}

// ─── Campaign Mapper ────────────────────────────────────────────────────────

interface RawCampaignLike {
    campaignId: number;
    name: string;
    state: string;
    portfolioId?: number;
    budget?: { budget: number; budgetType: string };
    startDate?: string;
    dynamicBidding?: {
        strategy: string;
        placementBidding?: { placement: string; percentage: number }[];
    };
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

function mapCampaign(
    rc: RawCampaignLike,
    m: MetricsLike | null,
    pm: MetricsLike | null,
    keywords: RawKeyword[] = [],
    portfolioMap: Map<string, string> = new Map()
): Campaign {
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

    const portfolioName = rc.portfolioId ? portfolioMap.get(String(rc.portfolioId)) ?? "" : "";

    const topKeyword = keywords.length > 0
        ? keywords.sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0]
        : null;

    const placements = rc.dynamicBidding?.placementBidding ?? [];
    const tosBid = placements.find(p => p.placement === "PLACEMENT_TOP")?.percentage ?? 0;
    const ppBid = placements.find(p => p.placement === "PLACEMENT_PRODUCT_PAGE")?.percentage ?? 0;

    return {
        id,
        name: rc.name,
        type: rc.targetingType === "AUTO" ? "SP Auto" : "SP Manual",
        status,
        dailyBudget: rc.budget?.budget ?? 0,
        startDate: rc.startDate ?? "",
        biddingStrategy: strategyMap[rc.dynamicBidding?.strategy ?? ""] ?? "Fixed Bid",
        portfolio: portfolioName,
        productIds: [],
        impressions, clicks, orders, units,
        sales: Math.round(sales * 100) / 100,
        conversion: Math.round(conversion * 100) / 100,
        spend: Math.round(spend * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        acos: Math.round(acos * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        keyword: topKeyword?.keywordText ?? "",
        bid: topKeyword?.bid ?? 0,
        placement: tosBid > 0 ? "Top of Search" : ppBid > 0 ? "Product Page" : "Rest of Search",
        placementBidTOS: tosBid,
        placementBidPP: ppBid,
        tosIS: 0,
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
