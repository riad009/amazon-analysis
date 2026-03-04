"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Campaign, DateRange, PlacementMetrics } from "@/lib/types";

export type DataSource = "live" | "mock" | "loading" | "error";

interface UseCampaignsResult {
    campaigns: Campaign[];
    placementData: Record<string, PlacementMetrics[]>;
    loading: boolean;
    metricsLoading: boolean;
    error: string | null;
    dataSource: DataSource;
    metricsAvailable: boolean;
    refresh: () => void;
    lastFetched: Date | null;
}

export function useAmazonCampaigns(
    dateRange: DateRange,
    profileId?: string,
    autoRefreshMs: number = 5 * 60 * 1000
): UseCampaignsResult {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [placementData, setPlacementData] = useState<Record<string, PlacementMetrics[]>>({});
    const [loading, setLoading] = useState(true);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<DataSource>("loading");
    const [metricsAvailable, setMetricsAvailable] = useState(false);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fromStr = dateRange.from.toISOString().split("T")[0];
    const toStr = dateRange.to.toISOString().split("T")[0];

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Clear old data immediately to prevent showing wrong account's data
        setCampaigns([]);
        setPlacementData({});
        setLoading(true);
        setError(null);
        setDataSource("loading");
        setMetricsAvailable(false);
        setMetricsLoading(false);

        const currentProfileId = profileId; // capture for stale check

        try {
            // ── Step 1: Get cached or listing data (instant) ──────────
            const profileParam = profileId ? `&profileId=${profileId}` : "";
            const listingRes = await fetch(
                `/api/amazon/campaigns?from=${fromStr}&to=${toStr}&phase=listing${profileParam}`,
                { signal: controller.signal }
            );

            if (!listingRes.ok) throw new Error(`API error: ${listingRes.status}`);
            const listingJson = await listingRes.json();
            if (!listingJson.success) throw new Error(listingJson.error ?? "Failed");

            // Stale check: if user switched accounts while we were fetching, discard
            if (controller.signal.aborted) return;

            // Show cached data immediately (instant display)
            setCampaigns(listingJson.data);
            setPlacementData(listingJson.placementData ?? {});
            setDataSource("live");
            setMetricsAvailable(listingJson.metricsAvailable ?? false);
            setLastFetched(new Date());
            setLoading(false);

            if (listingJson.metricsAvailable) {
                console.log(`[Campaigns] 📦 Showing cached data (profile=${currentProfileId}) — refreshing...`);
            }

            // ── Step 2: ALWAYS fetch fresh data from API ──────────────
            // Only show "Loading..." if the cached data didn't already have metrics.
            if (!listingJson.metricsAvailable) {
                setMetricsLoading(true);
            }
            console.log(`[Campaigns] ⏳ Fetching metrics (profile=${currentProfileId})...`);

            const fullRes = await fetch(
                `/api/amazon/campaigns?from=${fromStr}&to=${toStr}&phase=all${profileParam}`,
                { signal: controller.signal }
            );

            if (!fullRes.ok) throw new Error(`Metrics fetch error: ${fullRes.status}`);
            const fullJson = await fullRes.json();
            if (!fullJson.success) throw new Error(fullJson.error ?? "Metrics failed");

            // Stale check again before applying
            if (controller.signal.aborted) return;

            // Replace website data with fresh live data
            setCampaigns(fullJson.data);
            setPlacementData(fullJson.placementData ?? {});
            setMetricsAvailable(fullJson.metricsAvailable ?? false);
            setMetricsLoading(false);
            setLastFetched(new Date());
            console.log(`[Campaigns] ✅ Live metrics loaded (profile=${currentProfileId}) — ${fullJson.data.length} campaigns`);

        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(String(err));
            setDataSource("error");
            setLoading(false);
            setMetricsLoading(false);
        }
    }, [fromStr, toStr, profileId]);

    // Fetch on mount and date change
    useEffect(() => {
        fetchData();
        return () => { abortRef.current?.abort(); };
    }, [fetchData]);

    // Auto-refresh every N minutes
    useEffect(() => {
        if (autoRefreshMs <= 0) return;
        const interval = setInterval(fetchData, autoRefreshMs);
        return () => clearInterval(interval);
    }, [fetchData, autoRefreshMs]);

    return {
        campaigns,
        placementData,
        loading,
        metricsLoading,
        error,
        dataSource,
        metricsAvailable,
        refresh: fetchData,
        lastFetched,
    };
}
