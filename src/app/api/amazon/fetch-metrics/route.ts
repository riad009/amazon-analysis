import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import {
    isAmazonAdsConfigured,
    getDefaultProfileId,
    fetchCampaignReport,
    fetchPlacementReport,
    fetchCampaigns,
    fetchPortfolios,
    fetchKeywords,
} from "@/lib/amazon-ads";
import type { RawKeyword } from "@/lib/amazon-ads";

// Track active fetch abort controllers per profile so we can cancel
const activeFetches = new Map<string, AbortController>();

// ─── POST: Trigger a metrics fetch ─────────────────────────────────────────
// Only ONE fetch runs per profile at a time. Returns immediately if one is
// already running.

export async function POST(req: NextRequest) {
    if (!isAmazonAdsConfigured()) {
        return NextResponse.json(
            { success: false, error: "Amazon Ads API credentials not configured." },
            { status: 500 }
        );
    }

    await connectDB();

    let body: { profileId?: string; date?: string; from?: string; to?: string } = {};
    try {
        body = await req.json();
    } catch {
        // no body is fine — will use defaults
    }

    const profileId = body.profileId || getDefaultProfileId() || "";
    const targetDates = getTargetDates(body.from, body.to, body.date);

    const { DailyMetrics, CronSettings, FetchLog } = getProfileModels(profileId);

    // Check if already fetching
    let settings = await CronSettings.findOne({ profileId });
    if (!settings) {
        settings = await CronSettings.create({ profileId, intervalHours: 12 });
    }

    if (settings.isFetching) {
        // Auto-release stale locks older than 15 minutes
        const lockAge = Date.now() - new Date(settings.updatedAt).getTime();
        if (lockAge > 15 * 60 * 1000) {
            console.warn(`[Fetch Metrics] ⚠️ Stale lock detected (${Math.round(lockAge / 60000)}m old), releasing...`);
            await CronSettings.updateOne({ profileId }, { isFetching: false });
            activeFetches.get(profileId)?.abort();
            activeFetches.delete(profileId);
        } else {
            return NextResponse.json({
                success: true,
                status: "already_running",
                message: "A fetch is already in progress. Wait for it to finish or cancel it first.",
            });
        }
    }

    // Mark any old "in_progress" logs as cancelled
    await FetchLog.updateMany(
        { profileId, status: "in_progress" },
        { status: "cancelled", error: "Superseded by new fetch request" }
    );

    // Filter out dates that already have data
    const missingDates: string[] = [];
    for (const d of targetDates) {
        const exists = await DailyMetrics.countDocuments({ profileId, date: d });
        if (exists === 0) missingDates.push(d);
    }

    if (missingDates.length === 0) {
        return NextResponse.json({
            success: true,
            status: "complete",
            message: `All ${targetDates.length} day(s) already have metrics in the database.`,
        });
    }

    // Lock
    await CronSettings.updateOne({ profileId }, { isFetching: true });

    // Create single log entry
    const dateRangeStr = missingDates.length > 1
        ? `${missingDates[0]} to ${missingDates[missingDates.length - 1]}`
        : missingDates[0];
    const logEntry = await FetchLog.create({
        profileId,
        status: "in_progress",
        dateRangeFetched: dateRangeStr,
    });

    // Create abort controller for cancellation
    const abortController = new AbortController();
    activeFetches.set(profileId, abortController);

    // Run fetch inline (awaited) so it actually completes in dev mode
    await runFetchInBackground(profileId, missingDates, logEntry._id, abortController.signal);

    // Clean up
    activeFetches.delete(profileId);

    return NextResponse.json({
        success: true,
        status: "started",
        message: `Fetched metrics for ${missingDates.length} day(s). Data is now available.`,
        dates: missingDates,
    });
}

// ─── DELETE: Cancel an in-progress fetch ────────────────────────────────────

export async function DELETE(req: NextRequest) {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("profileId") || getDefaultProfileId() || "";

    const { CronSettings, FetchLog } = getProfileModels(profileId);

    // Abort the active fetch if it exists
    const controller = activeFetches.get(profileId);
    if (controller) {
        controller.abort();
        activeFetches.delete(profileId);
    }

    // Release lock
    await CronSettings.updateOne({ profileId }, { isFetching: false });

    // Mark all in-progress logs as cancelled
    const result = await FetchLog.updateMany(
        { profileId, status: "in_progress" },
        { status: "cancelled", error: "Cancelled by user" }
    );

    return NextResponse.json({
        success: true,
        message: `Cancelled. ${result.modifiedCount} fetch(es) stopped.`,
    });
}

// ─── Background fetch logic ────────────────────────────────────────────────

async function runFetchInBackground(profileId: string, targetDates: string[], logId: Types.ObjectId, signal: AbortSignal) {
    const start = Date.now();

    try {
        await connectDB();

        const { DailyMetrics, DailyPlacementMetrics, CampaignStructure, CronSettings, FetchLog } = getProfileModels(profileId);

        console.log(`[Fetch Metrics] ⏳ Background fetch for ${targetDates.length} day(s), profile=${profileId}...`);

        // Check cancellation before starting
        if (signal.aborted) throw new Error("Cancelled by user");

        // ── Step 0: Fetch & store campaign structure (names, budgets, keywords, etc.) ──
        try {
            console.log(`[Fetch Metrics] 📦 Fetching campaign structure from Amazon API...`);
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

            const structureOps = rawCampaigns.map((rc) => {
                const id = String(rc.campaignId);
                const status = rc.state === "ENABLED" ? "Enabled" : rc.state === "PAUSED" ? "Paused" : "Archived";
                const strategyMap: Record<string, string> = {
                    LEGACY_FOR_SALES: "Fixed Bid", AUTO_FOR_SALES: "Dynamic Bids - Down Only", MANUAL: "Fixed Bid",
                };
                const portfolioName = rc.portfolioId ? portfolioMap.get(String(rc.portfolioId)) ?? "" : "";
                const kws = keywordMap.get(id) ?? [];
                const topKeyword = kws.length > 0 ? kws.sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0] : null;
                const placements = rc.dynamicBidding?.placementBidding ?? [];
                const tosBid = placements.find((p: { placement: string }) => p.placement === "PLACEMENT_TOP")?.percentage ?? 0;
                const ppBid = placements.find((p: { placement: string }) => p.placement === "PLACEMENT_PRODUCT_PAGE")?.percentage ?? 0;

                return {
                    updateOne: {
                        filter: { profileId, campaignId: id },
                        update: {
                            $set: {
                                name: rc.name,
                                type: rc.targetingType === "AUTO" ? "SP Auto" : "SP Manual",
                                status,
                                dailyBudget: rc.budget?.budget ?? 0,
                                startDate: rc.startDate ?? "",
                                biddingStrategy: strategyMap[rc.dynamicBidding?.strategy ?? ""] ?? "Fixed Bid",
                                portfolio: portfolioName,
                                keyword: topKeyword?.keywordText ?? "",
                                bid: topKeyword?.bid ?? 0,
                                keywordId: topKeyword ? String(topKeyword.keywordId) : "",
                                placement: tosBid > 0 ? "Top of Search" : ppBid > 0 ? "Product Page" : "Rest of Search",
                                placementBidTOS: tosBid,
                                placementBidPP: ppBid,
                            },
                        },
                        upsert: true,
                    },
                };
            });

            if (structureOps.length > 0) {
                await CampaignStructure.bulkWrite(structureOps);
            }
            console.log(`[Fetch Metrics] ✅ Stored ${rawCampaigns.length} campaign structures`);

            // Small delay before metrics fetch
            await new Promise((r) => setTimeout(r, 2000));
        } catch (structErr) {
            console.warn(`[Fetch Metrics] ⚠️ Campaign structure fetch failed (non-fatal): ${String(structErr).slice(0, 150)}`);
        }

        let totalCampaignsCount = 0;
        let totalPlacementRowsCount = 0;

        for (let dayIdx = 0; dayIdx < targetDates.length; dayIdx++) {
            const targetDate = targetDates[dayIdx];

            // Check cancellation before each day
            if (signal.aborted) throw new Error("Cancelled by user");

            console.log(`[Fetch Metrics] ── Day ${dayIdx + 1}/${targetDates.length}: ${targetDate} ──`);

            // ── Step 1: Fetch campaign report (with retry for 425) ──
            let report: Awaited<ReturnType<typeof fetchCampaignReport>> | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`[Fetch Metrics] Campaign report attempt ${attempt}/3 for ${targetDate}...`);
                    report = await fetchCampaignReport(targetDate, targetDate, profileId);
                    break; // success
                } catch (err) {
                    const errStr = String(err);
                    if (errStr.includes("425") && attempt < 3) {
                        console.warn(`[Fetch Metrics] 425 rate limit on attempt ${attempt}, waiting 30s...`);
                        await new Promise((r) => setTimeout(r, 30000));
                    } else if (errStr.includes("timed out") && attempt < 3) {
                        console.warn(`[Fetch Metrics] Timeout on attempt ${attempt}, retrying in 10s...`);
                        await new Promise((r) => setTimeout(r, 10000));
                    } else {
                        // Log error but continue with next day
                        console.error(`[Fetch Metrics] ❌ Campaign report failed for ${targetDate}: ${errStr.slice(0, 150)}`);
                        report = null;
                        break;
                    }
                }
            }

            if (report && report.length > 0) {
                totalCampaignsCount += report.length;

                // Store campaign metrics
                const bulkOps = report.map((row) => ({
                    updateOne: {
                        filter: {
                            profileId,
                            campaignId: String(row.campaignId),
                            date: targetDate,
                        },
                        update: {
                            $set: {
                                campaignName: row.campaignName,
                                impressions: Number(row.impressions ?? 0),
                                clicks: Number(row.clicks ?? 0),
                                cost: Number(row.cost ?? 0),
                                orders: Number(row.purchases7d ?? 0),
                                units: Number(row.unitsSoldClicks7d ?? 0),
                                sales: Number(row.sales7d ?? 0),
                                fetchedAt: new Date(),
                            },
                        },
                        upsert: true,
                    },
                }));

                if (bulkOps.length > 0) {
                    await DailyMetrics.bulkWrite(bulkOps);
                }
                console.log(`[Fetch Metrics] ✅ Stored ${report.length} campaign metrics for ${targetDate}`);
            }

            // ── Step 2: Fetch placement report (non-blocking per day) ──
            if (report && report.length > 0) {
                // Delay to avoid Amazon 425 rate limit
                console.log("[Fetch Metrics] ⏳ Waiting 5s before placement report...");
                await new Promise((r) => setTimeout(r, 5000));

                try {
                    const placementRows = await fetchPlacementReport("__all__", targetDate, targetDate, profileId);
                    totalPlacementRowsCount += placementRows.length;

                    const placementOps = placementRows.map((row) => ({
                        updateOne: {
                            filter: {
                                profileId,
                                campaignId: String(row.campaignId),
                                date: targetDate,
                                placement: mapPlacementName(row.placementClassification ?? ""),
                            },
                            update: {
                                $set: {
                                    impressions: Number(row.impressions ?? 0),
                                    clicks: Number(row.clicks ?? 0),
                                    cost: Number(row.cost ?? 0),
                                    orders: Number(row.purchases7d ?? 0),
                                    units: Number(row.unitsSoldClicks7d ?? 0),
                                    sales: Number(row.sales7d ?? 0),
                                    fetchedAt: new Date(),
                                },
                            },
                            upsert: true,
                        },
                    }));

                    if (placementOps.length > 0) {
                        await DailyPlacementMetrics.bulkWrite(placementOps);
                    }
                    console.log(`[Fetch Metrics] ✅ Stored ${placementRows.length} placement rows for ${targetDate}`);
                } catch (placementErr) {
                    console.warn("[Fetch Metrics] ⚠️ Placement report failed (non-fatal):", String(placementErr).slice(0, 150));
                }
            }

            // Delay 2s between days to avoid rate limits
            if (dayIdx < targetDates.length - 1) {
                console.log("[Fetch Metrics] ⏳ Waiting 2s before next day...");
                await new Promise((r) => setTimeout(r, 2000));
            }
        }

        const durationMs = Date.now() - start;

        // Update log entry to success
        await FetchLog.updateOne(
            { _id: logId },
            {
                status: "success",
                campaignsCount: totalCampaignsCount,
                placementRowsCount: totalPlacementRowsCount,
                durationMs,
            }
        );

        // Update last fetched
        await CronSettings.updateOne(
            { profileId },
            { lastFetchedAt: new Date(), isFetching: false }
        );

        console.log(`[Fetch Metrics] 🏁 Done ${targetDates.length} day(s) in ${(durationMs / 1000).toFixed(1)}s — ${totalCampaignsCount} campaign rows, ${totalPlacementRowsCount} placement rows`);
    } catch (err) {
        const durationMs = Date.now() - start;
        const isCancelled = signal.aborted || String(err).includes("Cancelled by user");

        const models = getProfileModels(profileId);
        await models.FetchLog.updateOne(
            { _id: logId },
            { status: isCancelled ? "cancelled" : "error", error: isCancelled ? "Cancelled by user" : String(err), durationMs }
        ).catch(() => { });

        await models.CronSettings.updateOne({ profileId }, { isFetching: false }).catch(() => { });

        if (isCancelled) {
            console.log("[Fetch Metrics] 🛑 Cancelled by user");
        } else {
            console.error("[Fetch Metrics] ❌ Background error:", err);
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getYesterdayDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/** Build list of YYYY-MM-DD dates to fetch. Supports from/to range or single date. */
function getTargetDates(from?: string, to?: string, singleDate?: string): string[] {
    if (from && to) {
        const dates: string[] = [];
        // Use noon UTC to avoid timezone and DST edge cases
        let current = new Date(from + "T12:00:00Z");
        const end = new Date(to + "T12:00:00Z");
        // Cap at 31 days to avoid excessive API calls
        const maxDays = 31;
        while (current <= end && dates.length < maxDays) {
            dates.push(current.toISOString().split("T")[0]);
            current.setUTCDate(current.getUTCDate() + 1);
        }
        return dates;
    }
    return [singleDate || getYesterdayDate()];
}

function mapPlacementName(raw: string): string {
    if (raw.toLowerCase().includes("top of search")) return "Top of Search";
    if (raw.toLowerCase().includes("detail page") || raw.toLowerCase().includes("product page"))
        return "Product Page";
    return "Rest of Search";
}
