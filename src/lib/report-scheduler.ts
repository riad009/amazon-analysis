/**
 * Background Report Scheduler
 * 
 * Pre-fetches Amazon campaign reports on a schedule so metrics
 * are always ready when a user opens the dashboard.
 * 
 * Runs inside the Next.js server process using setInterval.
 * Started once via instrumentation.ts on server boot.
 */

import {
    isAmazonAdsConfigured,
    fetchCampaigns,
    fetchCampaignReport,
    fetchKeywords,
    fetchPortfolios,
} from "@/lib/amazon-ads";
import type { RawKeyword } from "@/lib/amazon-ads";
import type { Campaign } from "@/lib/types";
import fs from "fs";
import path from "path";

// ─── Config ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
const CACHE_DIR = process.env.VERCEL
    ? path.join("/tmp", ".cache")
    : path.join(process.cwd(), ".cache");

// Only pre-fetch the 30-day range (the default view)
const RANGES = [
    { days: 30, label: "30d" },
];

// ─── Scheduler State ───────────────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ─── Cache Helpers ─────────────────────────────────────────────────────────

interface CachedData {
    campaigns: Campaign[];
    fetchedAt: number;
    source: "live";
    metricsAvailable: boolean;
    dateKey: string;
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
        console.log(`[Scheduler] 💾 Saved ${data.campaigns.length} campaigns to ${path.basename(filePath)} (metrics=${data.metricsAvailable})`);
    } catch (err) {
        console.warn("[Scheduler] Failed to save:", err);
    }
}

// ─── Report Mapper (same logic as route.ts) ────────────────────────────────

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
        placement: tosBid > 0 ? "TOS" : ppBid > 0 ? "PP" : "ROS",
        placementBidTOS: tosBid,
        placementBidPP: ppBid,
        tosIS: 0,
        aiSuggestions: [],
    };
}

// ─── Core: Pre-fetch a single date range ───────────────────────────────────

async function prefetchRange(days: number, label: string) {
    const today = new Date();
    const to = today.toISOString().split("T")[0];
    const from = new Date(today.getTime() - (days - 1) * 86400000).toISOString().split("T")[0];
    const dateKey = `${from}|${to}`;

    console.log(`[Scheduler] 🔄 Fetching ${label} range (${from} → ${to})...`);
    const start = Date.now();

    try {
        // Fetch campaigns, keywords, portfolios in parallel
        const [rawCampaigns, keywords, portfolios] = await Promise.all([
            fetchCampaigns(),
            fetchKeywords().catch(() => [] as RawKeyword[]),
            fetchPortfolios().catch(() => []),
        ]);

        const portfolioMap = new Map<string, string>();
        for (const p of portfolios) portfolioMap.set(String(p.portfolioId), p.name);

        const keywordMap = new Map<string, RawKeyword[]>();
        for (const kw of keywords) {
            const cid = String(kw.campaignId);
            if (!keywordMap.has(cid)) keywordMap.set(cid, []);
            keywordMap.get(cid)!.push(kw);
        }

        // Fetch the report (this is the slow part — 30-120s)
        let report: MetricsLike[] = [];
        let metricsAvailable = false;

        try {
            report = await fetchCampaignReport(from, to);
            metricsAvailable = true;
        } catch (err) {
            console.warn(`[Scheduler] ⚠️ Report failed for ${label}:`, String(err).slice(0, 150));
        }

        const metricsMap = new Map(report.map((r) => [String((r as unknown as Record<string, unknown>).campaignId), r]));

        const campaigns = rawCampaigns.map((rc) => {
            const id = String(rc.campaignId);
            return mapCampaign(rc, metricsMap.get(id) ?? null, keywordMap.get(id) ?? [], portfolioMap);
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (metricsAvailable) {
            saveCacheToFile({ campaigns, fetchedAt: Date.now(), source: "live", metricsAvailable, dateKey });
            console.log(`[Scheduler] ✅ ${label} complete — ${campaigns.length} campaigns WITH metrics in ${elapsed}s`);
        } else {
            // Save campaigns without metrics (better than nothing)
            saveCacheToFile({ campaigns, fetchedAt: Date.now(), source: "live", metricsAvailable: false, dateKey });
            console.log(`[Scheduler] ⚠️ ${label} saved without metrics (report timed out) in ${elapsed}s`);
        }
    } catch (err) {
        console.error(`[Scheduler] ❌ ${label} failed:`, err);
    }
}

// ─── Run All Ranges ────────────────────────────────────────────────────────

async function runScheduledRefresh() {
    if (isRunning) {
        console.log("[Scheduler] ⏭️ Skipping — previous run still in progress");
        return;
    }

    if (!isAmazonAdsConfigured()) {
        console.log("[Scheduler] ⏭️ Skipping — Amazon Ads credentials not configured");
        return;
    }

    isRunning = true;
    console.log(`[Scheduler] 🚀 Starting scheduled refresh (${new Date().toLocaleTimeString()})`);

    for (const { days, label } of RANGES) {
        await prefetchRange(days, label);
    }

    console.log(`[Scheduler] 🏁 Scheduled refresh complete`);
    isRunning = false;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function startScheduler() {
    if (schedulerTimer) {
        console.log("[Scheduler] Already running");
        return;
    }

    console.log(`[Scheduler] 📅 Starting background report scheduler (every ${REFRESH_INTERVAL / 60000} min)`);

    // Run immediately on server start (with 5s delay to let Next.js finish booting)
    setTimeout(() => {
        runScheduledRefresh();
    }, 5000);

    // Then repeat every REFRESH_INTERVAL
    schedulerTimer = setInterval(runScheduledRefresh, REFRESH_INTERVAL);
}

export function stopScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
        console.log("[Scheduler] ⏹️ Stopped");
    }
}
