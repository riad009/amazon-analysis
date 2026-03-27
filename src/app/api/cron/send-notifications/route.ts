import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { NotificationSettings } from "@/lib/models/notification-settings";
import { getProfileModels } from "@/lib/models/profile-models";
import { sendEmail, buildPerformanceEmailHTML } from "@/lib/mailer";

/**
 * Cron Endpoint: Send scheduled email notifications.
 * 
 * Called every minute (by Vercel cron or local scheduler).
 * Checks all profiles with notifications enabled and sends
 * if enough time has passed since lastSentAt.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    // Verify cron secret in production
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        if (process.env.VERCEL) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }
    }

    await connectDB();

    // Find all profiles with notifications enabled
    const enabledSettings = await NotificationSettings.find({ enabled: true });

    if (enabledSettings.length === 0) {
        return NextResponse.json({
            success: true,
            message: "No notifications enabled",
            sent: 0,
        });
    }

    const now = Date.now();
    const results: { profileId: string; sent: boolean; reason?: string }[] = [];

    for (const settings of enabledSettings) {
        const intervalMs = settings.intervalMinutes * 60 * 1000;
        const lastSent = settings.lastSentAt ? new Date(settings.lastSentAt).getTime() : 0;
        const elapsed = now - lastSent;

        if (elapsed < intervalMs) {
            const remainingMin = Math.ceil((intervalMs - elapsed) / 60000);
            results.push({
                profileId: settings.profileId,
                sent: false,
                reason: `Not due yet (${remainingMin}m remaining)`,
            });
            continue;
        }

        if (!settings.recipientEmail) {
            results.push({
                profileId: settings.profileId,
                sent: false,
                reason: "No recipient email configured",
            });
            continue;
        }

        // Build email content
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
            const toDate = new Date().toISOString().split("T")[0];

            const { DailyMetrics } = getProfileModels(settings.profileId);
            const metricsAgg = await DailyMetrics.aggregate([
                {
                    $match: {
                        profileId: settings.profileId,
                        date: { $gte: fromDate, $lte: toDate },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalSpend: { $sum: "$cost" },
                        totalSales: { $sum: "$sales" },
                        totalOrders: { $sum: "$orders" },
                        totalClicks: { $sum: "$clicks" },
                        totalImpressions: { $sum: "$impressions" },
                        totalCampaigns: { $addToSet: "$campaignId" },
                    },
                },
            ]);

            const agg = metricsAgg[0] ?? {
                totalSpend: 0,
                totalSales: 0,
                totalOrders: 0,
                totalClicks: 0,
                totalImpressions: 0,
                totalCampaigns: [],
            };

            const totalSpend = Number(agg.totalSpend ?? 0);
            const totalSales = Number(agg.totalSales ?? 0);
            const overallAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;
            const overallRoas = totalSpend > 0 ? totalSales / totalSpend : 0;

            const html = buildPerformanceEmailHTML({
                totalCampaigns: Array.isArray(agg.totalCampaigns) ? agg.totalCampaigns.length : 0,
                totalSpend: Math.round(totalSpend * 100) / 100,
                totalSales: Math.round(totalSales * 100) / 100,
                totalOrders: Number(agg.totalOrders ?? 0),
                totalClicks: Number(agg.totalClicks ?? 0),
                totalImpressions: Number(agg.totalImpressions ?? 0),
                overallAcos: Math.round(overallAcos * 100) / 100,
                overallRoas: Math.round(overallRoas * 100) / 100,
                dateRange: `${fromDate} → ${toDate}`,
                profileName: "Amazon Ads",
            });

            const result = await sendEmail({
                to: settings.recipientEmail,
                subject: settings.emailSubject || "SellerOS — Campaign Performance Report",
                html,
            });

            if (result.success) {
                await NotificationSettings.updateOne(
                    { profileId: settings.profileId },
                    { lastSentAt: new Date() }
                );
                results.push({ profileId: settings.profileId, sent: true });
                console.log(`[Cron Notifications] ✅ Sent to ${settings.recipientEmail} for profile ${settings.profileId}`);
            } else {
                results.push({
                    profileId: settings.profileId,
                    sent: false,
                    reason: result.error,
                });
                console.error(`[Cron Notifications] ❌ Failed for profile ${settings.profileId}: ${result.error}`);
            }
        } catch (err) {
            results.push({
                profileId: settings.profileId,
                sent: false,
                reason: String(err),
            });
            console.error(`[Cron Notifications] ❌ Error for profile ${settings.profileId}:`, err);
        }
    }

    const sentCount = results.filter((r) => r.sent).length;
    console.log(`[Cron Notifications] 🏁 Processed ${results.length} profiles, sent ${sentCount} emails`);

    return NextResponse.json({
        success: true,
        sent: sentCount,
        total: results.length,
        results,
    });
}
