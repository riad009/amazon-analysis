"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Database,
    RefreshCcw,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Zap,
    Calendar,
    Timer,
    AlertCircle,
    Info,
    ChevronDown,
} from "lucide-react";

interface AccountProfile {
    profileId: number;
    countryCode: string;
    accountInfo: { name: string; type: string };
}

interface CronSettingsData {
    profileId: string;
    intervalHours: number;
    lastFetchedAt: string | null;
    isFetching: boolean;
}

interface FetchLogEntry {
    _id: string;
    profileId: string;
    fetchedAt: string;
    status: "success" | "error" | "in_progress" | "cancelled" | "abandoned";
    campaignsCount: number;
    placementRowsCount: number;
    durationMs: number;
    dateRangeFetched: string;
    error?: string;
}

const INTERVAL_OPTIONS = [
    { value: 1 / 60, label: "Every 1 Min" },
    { value: 5 / 60, label: "Every 5 Min" },
    { value: 15 / 60, label: "Every 15 Min" },
    { value: 30 / 60, label: "Every 30 Min" },
    { value: 1, label: "Every 1 Hour" },
    { value: 2, label: "Every 2 Hours" },
    { value: 6, label: "Every 6 Hours" },
    { value: 12, label: "Every 12 Hours" },
    { value: 24, label: "Every 24 Hours" },
    { value: 48, label: "Every 2 Days" },
];

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const seconds = Math.round((now - then) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
}

function StatusIcon({ status }: { status: string }) {
    if (status === "success")
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === "error")
        return <XCircle className="w-4 h-4 text-red-500" />;
    if (status === "cancelled")
        return <XCircle className="w-4 h-4 text-amber-500" />;
    return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
}

export default function ManageDataPage() {
    const [profiles, setProfiles] = useState<AccountProfile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<AccountProfile | null>(null);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

    const [settings, setSettings] = useState<CronSettingsData | null>(null);
    const [logs, setLogs] = useState<FetchLogEntry[]>([]);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [fetching, setFetching] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [savingInterval, setSavingInterval] = useState(false);
    const [fetchDays, setFetchDays] = useState<number>(30);
    const [fetchResult, setFetchResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);

    const profileId = selectedProfile ? String(selectedProfile.profileId) : "";

    // Load profiles
    useEffect(() => {
        fetch("/api/amazon/profiles")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    const sellers = json.data.filter(
                        (p: AccountProfile) => p.accountInfo?.type === "seller"
                    );
                    setProfiles(sellers);
                    if (sellers.length > 0) setSelectedProfile(sellers[0]);
                }
            })
            .catch((err) => console.error("[ManageData] profiles load:", err));
    }, []);

    // Listen for sidebar account change
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.profileId) {
                const match = profiles.find((p) => String(p.profileId) === detail.profileId);
                if (match) setSelectedProfile(match);
            }
        };
        window.addEventListener("account-changed", handler);
        return () => window.removeEventListener("account-changed", handler);
    }, [profiles]);

    const loadSettings = useCallback(async () => {
        if (!profileId) return;
        setLoadingSettings(true);
        try {
            const res = await fetch(`/api/amazon/cron-settings?profileId=${profileId}`);
            const json = await res.json();
            if (json.success) setSettings(json.data);
        } catch (err) {
            console.error("Failed to load settings:", err);
        } finally {
            setLoadingSettings(false);
        }
    }, [profileId]);

    const loadLogs = useCallback(async () => {
        if (!profileId) return;
        setLoadingLogs(true);
        try {
            const res = await fetch(`/api/amazon/fetch-log?profileId=${profileId}`);
            const json = await res.json();
            if (json.success) setLogs(json.data);
        } catch (err) {
            console.error("Failed to load logs:", err);
        } finally {
            setLoadingLogs(false);
        }
    }, [profileId]);

    useEffect(() => {
        if (profileId) {
            loadSettings();
            loadLogs();
        }
    }, [profileId, loadSettings, loadLogs]);

    // Poll for updates while backend is fetching (fire-and-forget pattern)
    // This polls even after the user's click returns — the backend continues working
    const isBackendFetching = fetching || settings?.isFetching;
    useEffect(() => {
        if (!isBackendFetching || !profileId) return;
        const interval = setInterval(() => {
            loadLogs();
            loadSettings();
        }, 5000);
        return () => clearInterval(interval);
    }, [isBackendFetching, profileId, loadLogs, loadSettings]);

    async function handleFetchNow() {
        if (!profileId) return;
        setFetching(true);
        setFetchResult(null);

        // Calculate date range based on selected days
        const to = new Date();
        to.setDate(to.getDate() - 1); // yesterday (Amazon has ~24h delay)
        const from = new Date(to);
        from.setDate(from.getDate() - fetchDays + 1);
        const pad = (n: number) => String(n).padStart(2, "0");
        const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
        const toStr = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`;

        try {
            const res = await fetch("/api/amazon/fetch-metrics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profileId, from: fromStr, to: toStr }),
            });
            const json = await res.json();
            if (json.success) {
                setFetchResult({
                    success: true,
                    message: json.status === "already_running"
                        ? "A fetch is already running. Wait for it to finish or cancel it first."
                        : json.status === "complete"
                            ? json.message
                            : `Fetched ${fetchDays} days (${fromStr} → ${toStr}). Data is now available on the Campaigns page.`,
                });
            } else {
                setFetchResult({ success: false, message: json.error });
            }
        } catch (err) {
            setFetchResult({ success: false, message: String(err) });
        } finally {
            setFetching(false);
            loadSettings();
            loadLogs();
        }
    }

    async function handleCancelFetch() {
        if (!profileId) return;
        setCancelling(true);
        try {
            const res = await fetch(`/api/amazon/fetch-metrics?profileId=${profileId}`, {
                method: "DELETE",
            });
            const json = await res.json();
            setFetchResult({
                success: true,
                message: json.message || "Fetch cancelled.",
            });
        } catch (err) {
            setFetchResult({ success: false, message: `Cancel failed: ${err}` });
        } finally {
            setCancelling(false);
            loadSettings();
            loadLogs();
        }
    }


    async function handleChangeInterval(hours: number) {
        if (!profileId) return;
        setSavingInterval(true);
        try {
            await fetch("/api/amazon/cron-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intervalHours: hours, profileId }),
            });
            await loadSettings();
        } catch (err) {
            console.error("Failed to save interval:", err);
        } finally {
            setSavingInterval(false);
        }
    }

    const countryLabel = selectedProfile?.countryCode
        ? `${selectedProfile.countryCode} Marketplace`
        : "";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b bg-background px-6 py-4 sticky top-0 z-20">
                <div className="flex items-center gap-2.5">
                    <Database className="w-5 h-5 text-primary" />
                    <h1 className="text-lg font-bold">Manage Data</h1>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure auto-fetch schedule and manually trigger metrics updates from Amazon Ads API.
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

                {/* ── Account Selector Card ────────────────────────────────── */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Database className="w-4 h-4 text-primary" />
                        Select Account
                    </h2>

                    {profiles.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading accounts...
                        </div>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                                className="w-full max-w-md flex items-center justify-between rounded-lg border px-4 py-3 text-left hover:border-primary/50 transition-colors"
                            >
                                <div>
                                    <p className="text-sm font-medium">
                                        {selectedProfile?.accountInfo.name ?? "Select account"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{countryLabel}</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${profileDropdownOpen ? "rotate-180" : ""}`} />
                            </button>

                            {profileDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                                    <div className="absolute left-0 top-full mt-1 z-50 w-full max-w-md bg-popover border rounded-lg shadow-lg py-1">
                                        {profiles.map((p) => (
                                            <button
                                                key={p.profileId}
                                                onClick={() => {
                                                    setSelectedProfile(p);
                                                    setProfileDropdownOpen(false);
                                                    setFetchResult(null);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 hover:bg-muted transition-colors ${selectedProfile?.profileId === p.profileId ? "bg-muted font-medium" : ""}`}
                                            >
                                                <p className="text-sm font-medium">{p.accountInfo.name}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {p.countryCode} Marketplace · Profile ID: {p.profileId}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── What Gets Fetched Card ───────────────────────────────── */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Info className="w-4 h-4 text-blue-500" />
                        What Gets Fetched
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="font-semibold text-foreground mb-1">📊 Campaign Metrics</p>
                            <p className="text-muted-foreground">
                                Impressions, Clicks, Spend, Sales, Orders, Units — per campaign, per day.
                                Used for ACOS, ROAS, CPC, CTR calculations.
                            </p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="font-semibold text-foreground mb-1">📍 Placement Breakdown</p>
                            <p className="text-muted-foreground">
                                Same metrics split by placement: Top of Search, Product Page, Rest of Search — per campaign, per day.
                            </p>
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">
                        Each fetch stores data for the selected date range (7, 14, or 30 days) per account in MongoDB.
                        Data is aggregated when you filter by date range on the Campaigns page.
                        Existing days are skipped automatically — only missing dates are fetched.
                    </p>
                </div>

                {/* ── Fetch Now Card ───────────────────────────────────────── */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" />
                                Fetch Metrics
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Fetch metrics for{" "}
                                <span className="font-medium text-foreground">
                                    {selectedProfile?.accountInfo.name ?? "the selected account"}
                                </span>{" "}
                                and store in database. Data will be available on the Campaigns page.
                            </p>
                        </div>
                    </div>

                    {/* Date range selector */}
                    <div className="mb-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Fetch Range</p>
                        <div className="flex gap-2">
                            {[
                                { days: 7, label: "Last 7 Days" },
                                { days: 14, label: "Last 14 Days" },
                                { days: 30, label: "Last 30 Days" },
                            ].map((opt) => (
                                <button
                                    key={opt.days}
                                    onClick={() => setFetchDays(opt.days)}
                                    disabled={fetching || settings?.isFetching}
                                    className={`
                                        rounded-lg border px-4 py-2.5 text-sm font-medium transition-all
                                        ${fetchDays === opt.days
                                            ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                                            : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                        }
                                        ${fetching || settings?.isFetching ? "opacity-50 pointer-events-none" : "cursor-pointer"}
                                    `}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleFetchNow}
                            disabled={fetching || settings?.isFetching || !profileId}
                            className="gap-2"
                        >
                            {fetching ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Fetching...
                                </>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4" />
                                    Fetch {fetchDays} Days Now
                                </>
                            )}
                        </Button>

                        {(settings?.isFetching || fetching) && (
                            <Button
                                variant="destructive"
                                onClick={handleCancelFetch}
                                disabled={cancelling}
                                className="gap-2"
                            >
                                {cancelling ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <XCircle className="w-4 h-4" />
                                )}
                                Cancel Fetch
                            </Button>
                        )}
                    </div>

                    {/* Fetch result */}
                    {fetchResult && (
                        <div
                            className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${fetchResult.success
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                        >
                            {fetchResult.success ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                            ) : (
                                <XCircle className="w-4 h-4 shrink-0" />
                            )}
                            {fetchResult.message}
                        </div>
                    )}

                    {/* Last fetched info */}
                    {settings?.lastFetchedAt && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            Last fetched:{" "}
                            <span className="text-foreground font-medium">
                                {new Date(settings.lastFetchedAt).toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                                ({formatTimeAgo(settings.lastFetchedAt)})
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Auto-Fetch Schedule Card ─────────────────────────────── */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
                        <Timer className="w-4 h-4 text-primary" />
                        Auto-Fetch Schedule
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        How often should metrics be automatically fetched from Amazon Ads API for{" "}
                        <span className="font-medium text-foreground">
                            {selectedProfile?.accountInfo.name ?? "this account"}
                        </span>.
                    </p>

                    {loadingSettings ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading settings...
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            {INTERVAL_OPTIONS.map((opt) => {
                                const isActive = settings?.intervalHours === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => handleChangeInterval(opt.value)}
                                        disabled={savingInterval}
                                        className={`
                      relative rounded-lg border px-4 py-3 text-sm font-medium transition-all
                      ${isActive
                                                ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                            }
                      ${savingInterval ? "opacity-50 pointer-events-none" : "cursor-pointer"}
                    `}
                                    >
                                        {opt.label}
                                        {isActive && (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-primary absolute top-1.5 right-1.5" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {settings && (
                        <p className="text-xs text-muted-foreground mt-3">
                            Currently set to fetch every{" "}
                            <span className="font-semibold text-foreground">
                                {settings.intervalHours < 1
                                    ? `${Math.round(settings.intervalHours * 60)} minute${Math.round(settings.intervalHours * 60) !== 1 ? "s" : ""}`
                                    : `${settings.intervalHours} hour${settings.intervalHours !== 1 ? "s" : ""}`}
                            </span>.
                        </p>
                    )}
                </div>

                {/* ── Fetch History Card ──────────────────────────────────── */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-primary" />
                                Fetch History
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Recent metrics fetch attempts for{" "}
                                <span className="font-medium text-foreground">
                                    {selectedProfile?.accountInfo.name ?? "this account"}
                                </span>.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadLogs}
                            disabled={loadingLogs}
                            className="gap-1.5 text-xs"
                        >
                            {loadingLogs ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RefreshCcw className="w-3.5 h-3.5" />
                            )}
                            Refresh
                        </Button>
                    </div>

                    {loadingLogs && logs.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading history...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-sm">No fetch history for this account yet.</p>
                            <p className="text-xs mt-1">
                                Click &quot;Fetch Now&quot; above to get started.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {logs
                                .filter((log) => log.status !== "abandoned")
                                .map((log) => (
                                <div
                                    key={log._id}
                                    className="flex items-center justify-between rounded-lg border px-4 py-3 text-xs"
                                >
                                    <div className="flex items-center gap-3">
                                        <StatusIcon status={log.status} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">
                                                    {log.dateRangeFetched || "—"}
                                                </span>
                                                <Badge
                                                    variant={
                                                        log.status === "success"
                                                            ? "default"
                                                            : log.status === "error"
                                                                ? "destructive"
                                                                : log.status === "cancelled"
                                                                    ? "secondary"
                                                                    : "secondary"
                                                    }
                                                    className={`text-[9px] h-4 ${log.status === "success"
                                                        ? "bg-emerald-600 text-white"
                                                        : log.status === "cancelled"
                                                            ? "bg-amber-100 text-amber-700 border-amber-200"
                                                            : ""
                                                        }`}
                                                >
                                                    {log.status === "success"
                                                        ? "Success"
                                                        : log.status === "error"
                                                            ? "Failed"
                                                            : log.status === "cancelled"
                                                                ? "Cancelled"
                                                                : "In Progress"}
                                                </Badge>
                                            </div>
                                            <p className="text-muted-foreground mt-0.5">
                                                {log.campaignsCount} campaigns
                                                {log.placementRowsCount > 0 &&
                                                    ` · ${log.placementRowsCount} placements`}
                                                {log.durationMs > 0 &&
                                                    ` · ${formatDuration(log.durationMs)}`}
                                                {log.error && log.status === "error" && (
                                                    <span className="text-red-500 ml-2">
                                                        {log.error.slice(0, 80)}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {log.status === "in_progress" && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancelFetch}
                                                disabled={cancelling}
                                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                {cancelling ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <XCircle className="w-3 h-3" />
                                                )}
                                                <span className="ml-1">Cancel</span>
                                            </Button>
                                        )}
                                        <div className="text-right text-muted-foreground whitespace-nowrap">
                                            <p>{new Date(log.fetchedAt).toLocaleString()}</p>
                                            <p className="text-[10px]">
                                                {formatTimeAgo(log.fetchedAt)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
