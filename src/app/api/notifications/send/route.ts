import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProfileModels } from "@/lib/models/profile-models";
import { NotificationSettings } from "@/lib/models/notification-settings";
import { getDefaultProfileId } from "@/lib/amazon-ads";
import { sendEmail, buildPerformanceEmailHTML } from "@/lib/mailer";

/**
 * POST: Send a performance email notification.
 * Can be called manually (test email) or by the cron endpoint.
 */

export async function POST(req: NextRequest) {
    await connectDB();

    let body: { profileId?: string; profileName?: string } = {};
    try {
        body = await req.json();
    } catch {
        // empty body is fine
    }

    const profileId = body.profileId || getDefaultProfileId() || "";
    const { DailyMetrics } = getProfileModels(profileId);

    // Load notification settings
    const settings = await NotificationSettings.findOne({ profileId });
    if (!settings || !settings.recipientEmail) {
        return NextResponse.json(
            { success: false, error: "Notification settings not configured" },
            { status: 400 }
        );
    }

    // Aggregate metrics from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
    const toDate = new Date().toISOString().split("T")[0];

    const metricsAgg = await DailyMetrics.aggregate([
        {
            $match: {
                profileId,
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
        profileName: body.profileName || "Amazon Ads",
    });

    const result = await sendEmail({
        to: settings.recipientEmail,
        subject: settings.emailSubject || "SellerOS — Campaign Performance Report",
        html,
    });

    if (result.success) {
        // Update lastSentAt
        await NotificationSettings.updateOne(
            { profileId },
            { lastSentAt: new Date() }
        );
    }

    return NextResponse.json(result);
}
