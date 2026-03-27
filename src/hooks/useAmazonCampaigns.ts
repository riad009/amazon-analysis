"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Campaign, DateRange, PlacementMetrics } from "@/lib/types";
import { formatLocalDate } from "@/lib/format";

export type DataSource = "live" | "mock" | "loading" | "error";

interface UseCampaignsResult {
    campaigns: Campaign[];
    placementData: Record<string, PlacementMetrics[]>;
    loading: boolean;
    error: string | null;
    dataSource: DataSource;
    metricsAvailable: boolean;
    refresh: () => void;
    lastFetched: Date | null;
    dataUpdatedAt: Date | null;
    message: string | null;
}

/**
 * Reads campaign data from MongoDB (via /api/amazon/campaigns).
 * Never calls the metrics fetch API — metrics are populated only by crons
 * or manually from the Manage Data page.
 */
export function useAmazonCampaigns(
    dateRange: DateRange,
    profileId?: string,
    autoRefreshMs: number = 5 * 60 * 1000
): UseCampaignsResult {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [placementData, setPlacementData] = useState<Record<string, PlacementMetrics[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<DataSource>("loading");
    const [metricsAvailable, setMetricsAvailable] = useState(false);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const [dataUpdatedAt, setDataUpdatedAt] = useState<Date | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const bgRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fromStr = formatLocalDate(dateRange.from);
    const toStr = formatLocalDate(dateRange.to);
    const queryKey = `${profileId ?? ""}_${fromStr}_${toStr}`;

    const cancelAll = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        if (bgRefreshTimerRef.current) { clearTimeout(bgRefreshTimerRef.current); bgRefreshTimerRef.current = null; }
    }, []);

    // Fetch campaign + metrics data from our API (reads from MongoDB)
    const fetchData = useCallback(async (skipCache = false) => {
        if (!profileId) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!skipCache) {
            setCampaigns([]);
            setPlacementData({});
            setLoading(true);
            setError(null);
            setDataSource("loading");
        }

        try {
            const url = `/api/amazon/campaigns?from=${fromStr}&to=${toStr}&profileId=${profileId}${skipCache ? "&cache=false" : ""}`;
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Failed");
            if (controller.signal.aborted) return;

            setCampaigns(json.data);
            setPlacementData(json.placementData ?? {});
            setDataSource("live");
            setMetricsAvailable(json.metricsAvailable ?? false);
            setDataUpdatedAt(json.dataUpdatedAt ? new Date(json.dataUpdatedAt) : null);
            setMessage(json.message ?? null);
            setLastFetched(new Date());
            setLoading(false);

            const metricsDays = json.metricsDays ?? 0;
            const expectedDays = json.expectedDays ?? 0;
            console.log(`[Campaigns] ✅ ${json.data.length} campaigns (profile=${profileId}, source=${json.source}, metrics=${json.metricsAvailable}, days=${metricsDays}/${expectedDays})`);

            // Background refresh if we got cached data
            if (json.source === "cache" && !skipCache) {
                bgRefreshTimerRef.current = setTimeout(() => {
                    bgRefreshTimerRef.current = null;
                    fetchData(true);
                }, 100);
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(String(err));
            setDataSource("error");
            setLoading(false);
        }
    }, [fromStr, toStr, profileId]);

    // On param change: cancel everything, fetch fresh from DB
    useEffect(() => {
        cancelAll();

        if (!profileId) {
            setCampaigns([]);
            setPlacementData({});
            setLoading(true);
            setError(null);
            setDataSource("loading");
            return;
        }

        fetchData();

        return cancelAll;
    }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh (only when profile is set)
    useEffect(() => {
        if (autoRefreshMs <= 0 || !profileId) return;
        const interval = setInterval(() => fetchData(), autoRefreshMs);
        return () => clearInterval(interval);
    }, [fetchData, autoRefreshMs, profileId]);

    return {
        campaigns,
        placementData,
        loading,
        error,
        dataSource,
        metricsAvailable,
        refresh: fetchData,
        lastFetched,
        dataUpdatedAt,
        message,
    };
}
