"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Bell,
    Mail,
    Send,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Timer,
    Power,
    Settings,
} from "lucide-react";

interface NotificationSettingsData {
    profileId: string;
    enabled: boolean;
    recipientEmail: string;
    intervalMinutes: number;
    emailSubject: string;
    lastSentAt: string | null;
}

const INTERVAL_PRESETS = [
    { value: 1, label: "1 min" },
    { value: 5, label: "5 min" },
    { value: 15, label: "15 min" },
    { value: 30, label: "30 min" },
    { value: 60, label: "1 hour" },
    { value: 360, label: "6 hours" },
    { value: 720, label: "12 hours" },
    { value: 1440, label: "24 hours" },
];

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const seconds = Math.round((now - then) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
}

export default function NotificationsPage() {
    const [settings, setSettings] = useState<NotificationSettingsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [sendResult, setSendResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);

    const [editEmail, setEditEmail] = useState("");
    const [editSubject, setEditSubject] = useState("");
    const [editInterval, setEditInterval] = useState(60);
    const [customInterval, setCustomInterval] = useState("");

    const loadSettings = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications/settings");
            const json = await res.json();
            if (json.success) {
                setSettings(json.data);
                setEditEmail(json.data.recipientEmail);
                setEditSubject(json.data.emailSubject);
                setEditInterval(json.data.intervalMinutes);
            }
        } catch (err) {
            console.error("Failed to load notification settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    async function updateSettings(updates: Partial<NotificationSettingsData>) {
        setSaving(true);
        try {
            const res = await fetch("/api/notifications/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const json = await res.json();
            if (json.success) {
                setSettings(json.data);
            }
        } catch (err) {
            console.error("Failed to update settings:", err);
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleEnabled() {
        if (!settings) return;
        await updateSettings({ enabled: !settings.enabled });
    }

    async function handleSaveEmail() {
        await updateSettings({ recipientEmail: editEmail, emailSubject: editSubject });
    }

    async function handleSetInterval(mins: number) {
        setEditInterval(mins);
        await updateSettings({ intervalMinutes: mins, enabled: true });
    }

    async function handleCustomInterval() {
        const mins = parseInt(customInterval, 10);
        if (isNaN(mins) || mins < 1) return;
        setEditInterval(mins);
        setCustomInterval("");
        await updateSettings({ intervalMinutes: mins, enabled: true });
    }

    async function handleSendTest() {
        setSendingTest(true);
        setSendResult(null);
        try {
            const res = await fetch("/api/notifications/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const json = await res.json();
            setSendResult({
                success: json.success,
                message: json.success
                    ? "Test email sent successfully! Check your inbox."
                    : json.error || "Failed to send email",
            });
            if (json.success) {
                loadSettings(); // Refresh lastSentAt
            }
        } catch (err) {
            setSendResult({ success: false, message: String(err) });
        } finally {
            setSendingTest(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b bg-background px-6 py-4 sticky top-0 z-20">
                <div className="flex items-center gap-2.5">
                    <Bell className="w-5 h-5 text-primary" />
                    <h1 className="text-lg font-bold">Email Notifications</h1>
                    {settings?.enabled ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                            <Power className="w-2.5 h-2.5" />
                            Active
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                            <Power className="w-2.5 h-2.5" />
                            Disabled
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure periodic performance report emails sent to your inbox.
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

                {/* Enable/Disable Card */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Power className="w-4 h-4 text-primary" />
                                Notification Status
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                {settings?.enabled
                                    ? "Notifications are active. Emails will be sent at the configured interval."
                                    : "Notifications are disabled. Enable to start receiving email reports."}
                            </p>
                        </div>
                        <Button
                            onClick={handleToggleEnabled}
                            disabled={saving}
                            variant={settings?.enabled ? "destructive" : "default"}
                            className="gap-2"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Power className="w-4 h-4" />
                            )}
                            {settings?.enabled ? "Disable" : "Enable"}
                        </Button>
                    </div>

                    {settings?.lastSentAt && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            Last sent:{" "}
                            <span className="text-foreground font-medium">
                                {new Date(settings.lastSentAt).toLocaleString()}
                            </span>
                            <span>({formatTimeAgo(settings.lastSentAt)})</span>
                        </div>
                    )}
                </div>

                {/* Email Configuration Card */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
                        <Mail className="w-4 h-4 text-primary" />
                        Email Configuration
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                                Recipient Email
                            </label>
                            <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="w-full max-w-md h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                                Email Subject
                            </label>
                            <input
                                type="text"
                                value={editSubject}
                                onChange={(e) => setEditSubject(e.target.value)}
                                placeholder="SellerOS — Campaign Performance Report"
                                className="w-full max-w-md h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                        </div>
                        <Button
                            onClick={handleSaveEmail}
                            disabled={saving}
                            size="sm"
                            className="gap-1.5"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                            Save Email Settings
                        </Button>
                    </div>
                </div>

                {/* Interval Configuration Card */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
                        <Timer className="w-4 h-4 text-primary" />
                        Notification Interval
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        How often should performance reports be emailed to you?
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
                        {INTERVAL_PRESETS.map((opt) => {
                            const isActive = editInterval === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSetInterval(opt.value)}
                                    disabled={saving}
                                    className={`
                                        relative rounded-lg border px-3 py-2.5 text-sm font-medium transition-all
                                        ${isActive
                                            ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                                            : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                        }
                                        ${saving ? "opacity-50 pointer-events-none" : "cursor-pointer"}
                                    `}
                                >
                                    {opt.label}
                                    {isActive && (
                                        <CheckCircle2 className="w-3 h-3 text-primary absolute top-1 right-1" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom interval */}
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            value={customInterval}
                            onChange={(e) => setCustomInterval(e.target.value)}
                            placeholder="Custom (minutes)"
                            className="w-40 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCustomInterval}
                            disabled={saving || !customInterval}
                        >
                            Set
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Currently:{" "}
                            <span className="font-semibold text-foreground">
                                {editInterval < 60
                                    ? `${editInterval} minute${editInterval !== 1 ? "s" : ""}`
                                    : editInterval < 1440
                                        ? `${editInterval / 60} hour${editInterval / 60 !== 1 ? "s" : ""}`
                                        : `${editInterval / 1440} day${editInterval / 1440 !== 1 ? "s" : ""}`}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Send Test Email Card */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Send className="w-4 h-4 text-amber-500" />
                                Test Email
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Send a test performance report email right now to verify everything works.
                            </p>
                        </div>
                        <Button
                            onClick={handleSendTest}
                            disabled={sendingTest || !settings?.recipientEmail}
                            className="gap-2"
                        >
                            {sendingTest ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Send Test Email
                                </>
                            )}
                        </Button>
                    </div>

                    {sendResult && (
                        <div
                            className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${sendResult.success
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                        >
                            {sendResult.success ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                            ) : (
                                <XCircle className="w-4 h-4 shrink-0" />
                            )}
                            {sendResult.message}
                        </div>
                    )}
                </div>

                {/* How It Works Card */}
                <div className="rounded-xl border bg-background shadow-sm p-6">
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Bell className="w-4 h-4 text-blue-500" />
                        How It Works
                    </h2>
                    <div className="space-y-2 text-xs text-muted-foreground">
                        <p>
                            <span className="font-medium text-foreground">1.</span> Enable notifications and set your preferred interval above.
                        </p>
                        <p>
                            <span className="font-medium text-foreground">2.</span> A background scheduler checks every minute if it&apos;s time to send.
                        </p>
                        <p>
                            <span className="font-medium text-foreground">3.</span> When due, it aggregates the last 30 days of campaign metrics from the database.
                        </p>
                        <p>
                            <span className="font-medium text-foreground">4.</span> A styled performance report (Spend, Sales, ACOS, ROAS, Orders, etc.) is emailed to your inbox.
                        </p>
                        <p className="mt-2 text-[11px]">
                            💡 <span className="font-medium text-foreground">Tip:</span> On Vercel (production), this runs via a cron job. Locally, a built-in scheduler handles it automatically.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
