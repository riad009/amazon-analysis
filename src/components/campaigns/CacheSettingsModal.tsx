"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Database,
    Trash2,
    RefreshCcw,
    CheckCircle2,
    Clock,
    Loader2,
    AlertCircle,
    HardDrive,
    Wifi,
    FileJson,
} from "lucide-react";

interface CacheFileInfo {
    dateKey: string;
    label: string;
    campaigns: number;
    metricsAvailable: boolean;
    fetchedAt: number;
    ageSeconds: number;
    filePath: string;
    fileSizeKB: number;
}

interface CacheStatus {
    success: boolean;
    cacheDir: string;
    files: CacheFileInfo[];
    totalSizeKB: number;
}

interface CacheSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentDataSource: string;
    currentMetricsAvailable: boolean;
    currentMetricsLoading: boolean;
    currentDateLabel: string;
    onClearCache: () => void;
}

function formatAge(seconds: number): string {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
}

function StatusDot({ status }: { status: "live" | "cached" | "loading" | "error" }) {
    const colors = {
        live: "bg-emerald-500",
        cached: "bg-amber-500",
        loading: "bg-blue-500 animate-pulse",
        error: "bg-red-500",
    };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

export function CacheSettingsModal({
    open,
    onOpenChange,
    currentDataSource,
    currentMetricsAvailable,
    currentMetricsLoading,
    currentDateLabel,
    onClearCache,
}: CacheSettingsModalProps) {
    const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/amazon/cache-status");
            const data = await res.json();
            setCacheStatus(data);
        } catch {
            setCacheStatus(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchStatus();
            const interval = setInterval(fetchStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [open, fetchStatus]);

    const handleClearCache = async () => {
        setClearing(true);
        try {
            await fetch("/api/amazon/cache-status", { method: "DELETE" });
            onClearCache();
            await fetchStatus();
        } catch {
            // silent
        } finally {
            setClearing(false);
        }
    };

    const currentStatus = currentMetricsLoading
        ? "loading"
        : currentDataSource === "live"
            ? "live"
            : currentDataSource === "error"
                ? "error"
                : "cached";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        Cache & Data Management
                    </DialogTitle>
                    <DialogDescription>
                        View the current data source and cache status for all date ranges.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Current Website Data */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Wifi className="w-4 h-4 text-primary" />
                                Current Website Data
                            </h3>
                            <Badge
                                variant={currentStatus === "live" ? "default" : "secondary"}
                                className={`text-[10px] ${currentStatus === "live" ? "bg-emerald-600 text-white"
                                        : currentStatus === "loading" ? "bg-blue-600 text-white"
                                            : currentStatus === "error" ? "bg-red-600 text-white"
                                                : ""
                                    }`}
                            >
                                <StatusDot status={currentStatus} />
                                <span className="ml-1.5">
                                    {currentStatus === "live" && "Live Data"}
                                    {currentStatus === "cached" && "Cached"}
                                    {currentStatus === "loading" && "Updating..."}
                                    {currentStatus === "error" && "Error"}
                                </span>
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                Date Range: <span className="text-foreground font-medium">{currentDateLabel}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                {currentMetricsAvailable ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : currentMetricsLoading ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                ) : (
                                    <AlertCircle className="w-3 h-3 text-amber-500" />
                                )}
                                Metrics:{" "}
                                <span className="text-foreground font-medium">
                                    {currentMetricsAvailable ? "Loaded ✅" : currentMetricsLoading ? "Loading..." : "Pending"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Cached Date Ranges */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-primary" />
                                Cached Date Ranges
                            </h3>
                            {cacheStatus && (
                                <span className="text-[10px] text-muted-foreground">
                                    {cacheStatus.totalSizeKB} KB total
                                </span>
                            )}
                        </div>

                        {loading && !cacheStatus ? (
                            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Loading cache status...
                            </div>
                        ) : cacheStatus?.files.length === 0 ? (
                            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                No cached data — first visit will fetch from API
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {cacheStatus?.files.map((file) => (
                                    <div
                                        key={file.dateKey}
                                        className="flex items-center justify-between rounded-md border px-3 py-2.5 text-xs"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileJson className="w-3.5 h-3.5 text-muted-foreground" />
                                            <div>
                                                <p className="font-medium">{file.label}</p>
                                                <p className="text-muted-foreground text-[10px]">
                                                    {file.campaigns} campaigns · {file.fileSizeKB} KB · {formatAge(file.ageSeconds)}
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            {file.metricsAvailable ? (
                                                <Badge variant="default" className="text-[9px] bg-emerald-600 text-white h-5">
                                                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                                    Metrics ✅
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-[9px] h-5">
                                                    <Clock className="w-2.5 h-2.5 mr-0.5" />
                                                    No Metrics
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchStatus}
                        disabled={loading}
                        className="gap-1.5 text-xs"
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        Refresh Status
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearCache}
                        disabled={clearing || (cacheStatus?.files.length === 0)}
                        className="gap-1.5 text-xs"
                    >
                        {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Clear All Cache
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
