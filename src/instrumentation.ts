// Instrumentation — runs once when the Next.js server starts.
// Used for scheduling background tasks in local dev (Vercel handles cron in production).

export async function register() {
    // Only run the local scheduler in development (not on Vercel)
    if (process.env.VERCEL) return;

    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    const cronSecret = process.env.CRON_SECRET || "";

    console.log("[Instrumentation] 🔔 Starting local schedulers...");
    console.log("[Instrumentation]   → Notification check: every 60s");
    console.log("[Instrumentation]   → Metrics fetch cron: every 6 hours");

    // Wait 10s after startup before first check
    setTimeout(() => {
        // ── Notification scheduler: every 60 seconds ──
        checkNotifications(baseUrl, cronSecret);
        setInterval(() => checkNotifications(baseUrl, cronSecret), 60_000);

        // ── Metrics fetch scheduler: every 6 hours ──
        // Also runs immediately on first startup to catch up
        checkMetricsFetch(baseUrl, cronSecret);
        setInterval(() => checkMetricsFetch(baseUrl, cronSecret), 6 * 60 * 60 * 1000);
    }, 10_000);
}

async function checkNotifications(baseUrl: string, cronSecret: string) {
    try {
        const res = await fetch(`${baseUrl}/api/cron/send-notifications`, {
            headers: { Authorization: `Bearer ${cronSecret}` },
        });
        const json = await res.json();
        if (json.sent > 0) {
            console.log(`[Scheduler] ✅ Sent ${json.sent} notification(s)`);
        }
    } catch {
        // Server might not be ready yet
    }
}

async function checkMetricsFetch(baseUrl: string, cronSecret: string) {
    try {
        console.log("[Scheduler] 📊 Running metrics fetch cron...");
        const res = await fetch(`${baseUrl}/api/cron/fetch-metrics`, {
            headers: { Authorization: `Bearer ${cronSecret}` },
        });
        const json = await res.json();
        console.log(`[Scheduler] 📊 Metrics cron result:`, json.success ? "success" : json.error);
    } catch {
        // Server might not be ready yet
    }
}
