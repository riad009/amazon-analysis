"use client";

/**
 * Animated loading skeleton that matches the campaign table layout.
 * Shown during initial data fetch from the Amazon Ads API.
 */
export function CampaignTableSkeleton() {
    return (
        <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
            {/* Header shimmer */}
            <div className="border-b px-4 py-3 flex items-center gap-4">
                <div className="w-5 h-5 rounded bg-muted animate-pulse" />
                <div className="w-16 h-3 rounded bg-muted animate-pulse" />
                <div className="w-32 h-3 rounded bg-muted animate-pulse" />
                <div className="w-16 h-3 rounded bg-muted animate-pulse" />
                <div className="w-16 h-3 rounded bg-muted animate-pulse" />
                <div className="flex-1" />
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="w-14 h-3 rounded bg-muted animate-pulse" />
                ))}
            </div>

            {/* Row shimmers */}
            {Array.from({ length: 8 }).map((_, rowIdx) => (
                <div
                    key={rowIdx}
                    className="border-b last:border-b-0 px-4 py-3.5 flex items-center gap-4"
                    style={{ animationDelay: `${rowIdx * 75}ms` }}
                >
                    <div className="w-5 h-5 rounded bg-muted/50 animate-pulse" />
                    <div className="w-16 h-5 rounded-full bg-muted/50 animate-pulse" />
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <div
                            className="h-3.5 rounded bg-muted/60 animate-pulse"
                            style={{ width: `${140 + (rowIdx * 17) % 80}px` }}
                        />
                        <div className="w-24 h-2.5 rounded bg-muted/30 animate-pulse" />
                    </div>
                    <div className="w-16 h-3.5 rounded bg-muted/40 animate-pulse" />
                    <div className="w-16 h-3.5 rounded bg-muted/40 animate-pulse" />
                    <div className="flex-1" />
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-14 h-3.5 rounded bg-muted/40 animate-pulse"
                            style={{ animationDelay: `${(rowIdx * 7 + i) * 30}ms` }}
                        />
                    ))}
                    <div className="w-5 h-5 rounded bg-muted/30 animate-pulse" />
                </div>
            ))}

            {/* Bottom bar */}
            <div className="px-4 py-3 flex items-center justify-between bg-muted/10">
                <div className="w-32 h-3 rounded bg-muted/30 animate-pulse" />
                <div className="flex gap-2">
                    <div className="w-20 h-7 rounded bg-muted/30 animate-pulse" />
                    <div className="w-20 h-7 rounded bg-muted/30 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

/**
 * Skeleton for the performance summary cards.
 */
export function PerfSummarySkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-xl border bg-background p-4 shadow-sm flex flex-col gap-2"
                    style={{ animationDelay: `${i * 60}ms` }}
                >
                    <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded bg-muted animate-pulse" />
                        <div className="w-16 h-2.5 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="w-20 h-6 rounded bg-muted/60 animate-pulse" />
                    <div className="w-24 h-2.5 rounded bg-muted/30 animate-pulse" />
                </div>
            ))}
        </div>
    );
}
