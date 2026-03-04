"use client";

import { useState, useEffect } from "react";
import { PlacementMetrics } from "@/lib/types";
import {
    formatCurrency,
    formatNumber,
    formatPercent,
    acosColor,
    roasColor,
} from "@/lib/format";
import { Loader2 } from "lucide-react";

interface PlacementBreakdownProps {
    campaignId: string;
    campaignName: string;
    fromDate: string;
    toDate: string;
    profileId?: string;
    preloadedData?: PlacementMetrics[];
}

export function PlacementBreakdown({
    campaignId,
    campaignName,
    fromDate,
    toDate,
    profileId,
    preloadedData,
}: PlacementBreakdownProps) {
    const [placements, setPlacements] = useState<PlacementMetrics[] | null>(
        preloadedData ?? null
    );
    const [loading, setLoading] = useState(!preloadedData);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (preloadedData) {
            setPlacements(preloadedData);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const profileParam = profileId ? `&profileId=${profileId}` : "";
        fetch(
            `/api/amazon/campaigns/placements?campaignId=${campaignId}&from=${fromDate}&to=${toDate}${profileParam}`
        )
            .then((res) => res.json())
            .then((json) => {
                if (cancelled) return;
                if (!json.success) throw new Error(json.error ?? "Failed to load placements");
                setPlacements(json.data);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(String(err));
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [campaignId, fromDate, toDate, profileId, preloadedData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading placement metrics...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-3 text-sm text-red-500">
                Failed to load placement data: {error}
            </div>
        );
    }

    if (!placements || placements.length === 0) {
        return (
            <div className="text-center py-3 text-sm text-muted-foreground">
                No placement data available.
            </div>
        );
    }

    // Calculate totals
    const totals = placements.reduce(
        (acc, p) => ({
            impressions: acc.impressions + p.impressions,
            clicks: acc.clicks + p.clicks,
            orders: acc.orders + p.orders,
            units: acc.units + p.units,
            sales: acc.sales + p.sales,
            spend: acc.spend + p.spend,
        }),
        { impressions: 0, clicks: 0, orders: 0, units: 0, sales: 0, spend: 0 }
    );
    const totalCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const totalAcos = totals.sales > 0 ? (totals.spend / totals.sales) * 100 : 0;
    const totalRoas = totals.spend > 0 ? totals.sales / totals.spend : 0;
    const totalConversion = totals.clicks > 0 ? (totals.orders / totals.clicks) * 100 : 0;

    return (
        <div className="rounded-md border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[160px_80px_repeat(10,1fr)] text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b">
                <div className="px-3 py-2">Placement</div>
                <div className="px-2 py-2 text-right">Bid Adj %</div>
                <div className="px-2 py-2 text-right">Impressions</div>
                <div className="px-2 py-2 text-right">Clicks</div>
                <div className="px-2 py-2 text-right">Orders</div>
                <div className="px-2 py-2 text-right">Units</div>
                <div className="px-2 py-2 text-right">Sales</div>
                <div className="px-2 py-2 text-right">Spend</div>
                <div className="px-2 py-2 text-right">CPC</div>
                <div className="px-2 py-2 text-right">ACOS</div>
                <div className="px-2 py-2 text-right">ROAS</div>
                <div className="px-2 py-2 text-right">CVR</div>
            </div>

            {/* Placement rows */}
            {placements.map((p, i) => (
                <div
                    key={p.placement}
                    className={`grid grid-cols-[160px_80px_repeat(10,1fr)] text-xs ${i < placements.length - 1 ? "border-b border-border/50" : ""} hover:bg-muted/30 transition-colors`}
                >
                    <div className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        {p.placement}
                    </div>
                    <div className="px-2 py-2 text-right font-mono text-muted-foreground">
                        —
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatNumber(p.impressions)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatNumber(p.clicks)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatNumber(p.orders)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatNumber(p.units)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatCurrency(p.sales)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {formatCurrency(p.spend)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono text-muted-foreground">
                        {formatCurrency(p.cpc)}
                    </div>
                    <div className={`px-2 py-2 text-right font-mono font-semibold ${acosColor(p.acos)}`}>
                        {p.acos > 0 ? formatPercent(p.acos) : "—"}
                    </div>
                    <div className={`px-2 py-2 text-right font-mono font-semibold ${roasColor(p.roas)}`}>
                        {p.roas > 0 ? `${p.roas.toFixed(2)}x` : "—"}
                    </div>
                    <div className="px-2 py-2 text-right font-mono">
                        {p.conversion > 0 ? formatPercent(p.conversion) : "—"}
                    </div>
                </div>
            ))}

            {/* Totals row */}
            <div className="grid grid-cols-[160px_80px_repeat(10,1fr)] text-xs font-semibold border-t bg-muted/40">
                <div className="px-3 py-2 text-foreground">Total</div>
                <div className="px-2 py-2" />
                <div className="px-2 py-2 text-right font-mono">
                    {formatNumber(totals.impressions)}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {formatNumber(totals.clicks)}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {formatNumber(totals.orders)}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {formatNumber(totals.units)}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {formatCurrency(totals.sales)}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {formatCurrency(totals.spend)}
                </div>
                <div className="px-2 py-2 text-right font-mono text-muted-foreground">
                    {formatCurrency(totalCpc)}
                </div>
                <div className={`px-2 py-2 text-right font-mono font-semibold ${acosColor(totalAcos)}`}>
                    {totalAcos > 0 ? formatPercent(totalAcos) : "—"}
                </div>
                <div className={`px-2 py-2 text-right font-mono font-semibold ${roasColor(totalRoas)}`}>
                    {totalRoas > 0 ? `${totalRoas.toFixed(2)}x` : "—"}
                </div>
                <div className="px-2 py-2 text-right font-mono">
                    {totalConversion > 0 ? formatPercent(totalConversion) : "—"}
                </div>
            </div>
        </div>
    );
}
