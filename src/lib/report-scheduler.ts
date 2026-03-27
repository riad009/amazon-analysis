// Old file-based report scheduler — DEPRECATED.
// Replaced by Vercel Cron Jobs + MongoDB storage.
// See: /api/cron/fetch-metrics and vercel.json
//
// This file is kept as a no-op to avoid breaking any imports.

export function startScheduler() {
    console.log("[Scheduler] Deprecated — use Vercel Cron + MongoDB instead. See /api/cron/fetch-metrics");
}

export function stopScheduler() {
    // no-op
}
