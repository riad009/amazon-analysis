"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Campaign, DateRange } from "@/lib/types";

export type DataSource = "live" | "mock" | "loading" | "error";

interface UseCampaignsResult {
    campaigns: Campaign[];
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
    autoRefreshMs: number = 5 * 60 * 1000
): UseCampaignsResult {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<DataSource>("loading");
    const [metricsAvailable, setMetricsAvailable] = useState(false);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        const from = dateRange.from.toISOString().split("T")[0];
        const to = dateRange.to.toISOString().split("T")[0];

        try {
            // Phase 1: listing (may return cached data instantly!)
            const listingRes = await fetch(
                `/api/amazon/campaigns?from=${from}&to=${to}&phase=listing`,
                { signal: controller.signal }
            );

            if (!listingRes.ok) throw new Error(`API error: ${listingRes.status}`);
            const listingJson = await listingRes.json();
            if (!listingJson.success) throw new Error(listingJson.error ?? "Failed");

            // Show data immediately
            setCampaigns(listingJson.data);
            setDataSource(listingJson.source === "live" ? "live" : "mock");
            setMetricsAvailable(listingJson.metricsAvailable ?? false);
            setLastFetched(new Date());
            setLoading(false);

            // If cached with metrics, or mock data, we're done
            if (listingJson.cached && listingJson.metricsAvailable) return;
            if (listingJson.source !== "live") return;

            // Phase 2: full metrics (background)
            setMetricsLoading(true);

            try {
                const metricsRes = await fetch(
                    `/api/amazon/campaigns?from=${from}&to=${to}&phase=metrics`,
                    { signal: controller.signal }
                );

                if (!metricsRes.ok) throw new Error(`Metrics error: ${metricsRes.status}`);
                const metricsJson = await metricsRes.json();

                if (metricsJson.success) {
                    setCampaigns(metricsJson.data);
                    setMetricsAvailable(metricsJson.metricsAvailable ?? false);
                    setLastFetched(new Date());
                }
            } catch (metricsErr) {
                if ((metricsErr as Error).name === "AbortError") return;
                console.warn("[Campaigns] Metrics failed:", metricsErr);
            } finally {
                setMetricsLoading(false);
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(String(err));
            setDataSource("error");
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchData();
        return () => abortRef.current?.abort();
    }, [fetchData]);

    useEffect(() => {
        if (autoRefreshMs <= 0) return;
        const interval = setInterval(fetchData, autoRefreshMs);
        return () => clearInterval(interval);
    }, [fetchData, autoRefreshMs]);

    return {
        campaigns,
        loading,
        metricsLoading,
        error,
        dataSource,
        metricsAvailable,
        refresh: fetchData,
        lastFetched,
    };
}
