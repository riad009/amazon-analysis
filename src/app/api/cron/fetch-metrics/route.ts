import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import {
    isAmazonAdsConfigured,
    getDefaultProfileId,
    fetchCampaignReport,
    fetchPlacementReport,
    fetchProfiles,
    fetchCampaigns,
    fetchPortfolios,
    fetchKeywords,
} from "@/lib/amazon-ads";
import type { RawKeyword } from "@/lib/amazon-ads";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getLastNDates(n: number): string[] {
    const dates: string[] = [];
    for (let i = 1; i <= n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${year}-${month}-${day}`);
    }
    return dates.sort();
}

function mapPlacementName(raw: string): string {
    if (raw.toLowerCase().includes("top of search")) return "Top of Search";
    if (raw.toLowerCase().includes("detail page") || raw.toLowerCase().includes("product page"))
        return "Product Page";
    return "Rest of Search";
}

export async function GET(req: NextRequest) {
    const start = Date.now();

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && process.env.VERCEL) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAmazonAdsConfigured()) {
        return NextResponse.json({ success: false, error: "Amazon Ads API not configured" });
    }

    await connectDB();

    const targetDates = getLastNDates(7);
    const results: { profileId: string; campaigns: number; placements: number; daysProcessed: number; error?: string }[] = [];

    try {
        let profileIds: string[] = [];
        try {
            const profiles = await fetchProfiles();
            const sellers = profiles.filter((p: { accountInfo?: { type?: string } }) =>
                p.accountInfo?.type === "seller"
            );
            profileIds = sellers.map((p: { profileId: number }) => String(p.profileId));
        } catch {
            const defaultId = getDefaultProfileId();
            if (defaultId) profileIds = [defaultId];
        }

        if (profileIds.length === 0) {
            return NextResponse.json({ success: false, error: "No profiles found" });
        }

        console.log(`[Cron] 🚀 Fetching ${profileIds.length} profiles × ${targetDates.length} days (${targetDates[0]} → ${targetDates[targetDates.length - 1]})`);

        for (const profileId of profileIds) {
            const profileResult = { profileId, campaigns: 0, placements: 0, daysProcessed: 0, error: undefined as string | undefined };

            // Get per-account collections for this profile
            const { DailyMetrics, DailyPlacementMetrics, CampaignStructure, CronSettings, FetchLog } = getProfileModels(profileId);

            // Lock management with stale auto-release
            let settings = await CronSettings.findOne({ profileId });
            if (!settings) {
                settings = await CronSettings.create({ profileId, intervalHours: 12 });
            }
            if (settings.isFetching) {
                const lockAge = Date.now() - new Date(settings.updatedAt).getTime();
                if (lockAge > 15 * 60 * 1000) {
                    console.warn(`[Cron] ⚠️ Stale lock for ${profileId} (${Math.round(lockAge / 60000)}m), releasing`);
                    await CronSettings.updateOne({ profileId }, { isFetching: false });
                } else {
                    profileResult.error = "Already fetching, skipped";
                    results.push(profileResult);
                    continue;
                }
            }
            await CronSettings.updateOne({ profileId }, { isFetching: true });

            const dateRangeStr = `${targetDates[0]} to ${targetDates[targetDates.length - 1]}`;
            const logEntry = await FetchLog.create({
                profileId,
                status: "in_progress",
                dateRangeFetched: dateRangeStr,
            });

            try {
                // ── Step 0: Fetch & store campaign structure ──
                try {
                    console.log(`[Cron] 📦 Fetching campaign structure for ${profileId}...`);
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
                    console.log(`[Cron] ✅ Stored ${rawCampaigns.length} campaign structures for ${profileId}`);
                    await new Promise((r) => setTimeout(r, 2000));
                } catch (structErr) {
                    console.warn(`[Cron] ⚠️ Campaign structure fetch failed (non-fatal): ${String(structErr).slice(0, 150)}`);
                }

                // ── Step 1 & 2: Fetch metrics per day ──
                for (const targetDate of targetDates) {
                    // Skip dates that already have data for this profile
                    const existing = await DailyMetrics.countDocuments({ profileId, date: targetDate });
                    if (existing > 0) {
                        console.log(`[Cron] ⏩ Skip ${profileId}/${targetDate} (${existing} rows exist)`);
                        continue;
                    }

                    // Campaign report with retry
                    let report: Awaited<ReturnType<typeof fetchCampaignReport>> | null = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            report = await fetchCampaignReport(targetDate, targetDate, profileId);
                            break;
                        } catch (err) {
                            const errStr = String(err);
                            if (errStr.includes("425") && attempt < 3) {
                                console.warn(`[Cron] 425 rate limit, wait 30s (attempt ${attempt})`);
                                await new Promise((r) => setTimeout(r, 30000));
                            } else if (errStr.includes("timed out") && attempt < 3) {
                                console.warn(`[Cron] Timeout, retry in 10s (attempt ${attempt})`);
                                await new Promise((r) => setTimeout(r, 10000));
                            } else {
                                throw err;
                            }
                        }
                    }

                    if (!report) throw new Error(`Campaign report failed for ${targetDate}`);

                    profileResult.campaigns += report.length;
                    profileResult.daysProcessed++;

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
                    if (bulkOps.length > 0) await DailyMetrics.bulkWrite(bulkOps);

                    // Placement report (5s delay, non-fatal)
                    await new Promise((r) => setTimeout(r, 5000));
                    try {
                        const rows = await fetchPlacementReport("__all__", targetDate, targetDate, profileId);
                        profileResult.placements += rows.length;
                        const placementOps = rows.map((row) => ({
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
                        if (placementOps.length > 0) await DailyPlacementMetrics.bulkWrite(placementOps);
                    } catch (placementErr) {
                        console.warn(`[Cron] ⚠️ Placement failed (non-fatal):`, String(placementErr).slice(0, 100));
                    }

                    console.log(`[Cron] ✅ ${profileId}/${targetDate}: ${report.length} campaigns`);
                } // end per-day loop

                await FetchLog.updateOne(
                    { _id: logEntry._id },
                    {
                        status: "success",
                        campaignsCount: profileResult.campaigns,
                        placementRowsCount: profileResult.placements,
                        durationMs: Date.now() - start,
                    }
                );
                await CronSettings.updateOne(
                    { profileId },
                    { lastFetchedAt: new Date(), isFetching: false }
                );
                console.log(`[Cron] ✅ Profile ${profileId} done: ${profileResult.daysProcessed} days, ${profileResult.campaigns} campaigns, ${profileResult.placements} placements`);
            } catch (err) {
                profileResult.error = String(err);
                await FetchLog.updateOne(
                    { _id: logEntry._id },
                    { status: "error", error: String(err), durationMs: Date.now() - start }
                );
                await CronSettings.updateOne({ profileId }, { isFetching: false });
                console.error(`[Cron] ❌ Profile ${profileId}:`, err);
            }

            results.push(profileResult);
        } // end per-profile loop

        const totalDuration = Date.now() - start;
        console.log(`[Cron] 🏁 Done in ${(totalDuration / 1000).toFixed(1)}s — ${results.length} profiles`);

        return NextResponse.json({
            success: true,
            dates: targetDates,
            durationMs: totalDuration,
            profiles: results,
        });
    } catch (err) {
        console.error("[Cron] Fatal error:", err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
