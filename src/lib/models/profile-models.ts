import mongoose, { Schema, Model } from "mongoose";
import type { IDailyMetrics } from "./daily-metrics";
import type { IDailyPlacementMetrics } from "./daily-placement-metrics";
import type { ICampaignCache } from "./campaign-cache";
import type { ICampaignStructure } from "./campaign-structure";
import type { IFetchLog } from "./fetch-log";
import type { ICronSettings } from "./cron-settings";

/**
 * Per-account collection mapping.
 * Each seller account gets its own set of MongoDB collections:
 *   premium_mart_daily_metrics, norcalway_daily_metrics, etc.
 *
 * Add new accounts here as they are onboarded.
 */
const PROFILE_PREFIXES: Record<string, string> = {
    "1954065947972653": "premium_mart",
    "404698923179134": "norcalway",
};

function getPrefix(profileId: string): string {
    return PROFILE_PREFIXES[profileId] ?? `account_${profileId}`;
}

// ── Schemas (reused across all per-profile models) ──────────────────────────

const DailyMetricsSchema = new Schema<IDailyMetrics>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        campaignName: { type: String, required: true },
        date: { type: String, required: true, index: true },
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
        units: { type: Number, default: 0 },
        sales: { type: Number, default: 0 },
        fetchedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);
DailyMetricsSchema.index({ profileId: 1, campaignId: 1, date: 1 }, { unique: true });

const DailyPlacementMetricsSchema = new Schema<IDailyPlacementMetrics>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        date: { type: String, required: true, index: true },
        placement: { type: String, required: true },
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
        units: { type: Number, default: 0 },
        sales: { type: Number, default: 0 },
        fetchedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);
DailyPlacementMetricsSchema.index({ profileId: 1, campaignId: 1, date: 1, placement: 1 }, { unique: true });

const CampaignStructureSchema = new Schema<ICampaignStructure>(
    {
        profileId: { type: String, required: true, index: true },
        campaignId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        type: { type: String, default: "" },
        status: { type: String, default: "Enabled" },
        dailyBudget: { type: Number, default: 0 },
        startDate: { type: String, default: "" },
        biddingStrategy: { type: String, default: "Fixed Bid" },
        portfolio: { type: String, default: "" },
        keyword: { type: String, default: "" },
        bid: { type: Number, default: 0 },
        keywordId: { type: String, default: "" },
        placement: { type: String, default: "Rest of Search" },
        placementBidTOS: { type: Number, default: 0 },
        placementBidPP: { type: Number, default: 0 },
    },
    { timestamps: true }
);
CampaignStructureSchema.index({ profileId: 1, campaignId: 1 }, { unique: true });

const CampaignCacheSchema = new Schema<ICampaignCache>(
    {
        profileId: { type: String, required: true },
        dateFrom: { type: String, required: true },
        dateTo: { type: String, required: true },
        campaigns: { type: Schema.Types.Mixed, default: [] },
        placementData: { type: Schema.Types.Mixed, default: {} },
        metricsAvailable: { type: Boolean, default: false },
    },
    { timestamps: true }
);
CampaignCacheSchema.index({ profileId: 1, dateFrom: 1, dateTo: 1 }, { unique: true });

const FetchLogSchema = new Schema<IFetchLog>(
    {
        profileId: { type: String, required: true, index: true },
        fetchedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ["success", "error", "in_progress", "cancelled", "abandoned"], default: "in_progress" },
        campaignsCount: { type: Number, default: 0 },
        placementRowsCount: { type: Number, default: 0 },
        durationMs: { type: Number, default: 0 },
        dateRangeFetched: { type: String, default: "" },
        error: { type: String },
    },
    { timestamps: true }
);

const CronSettingsSchema = new Schema<ICronSettings>(
    {
        profileId: { type: String, required: true, unique: true },
        intervalHours: { type: Number, default: 12 },
        lastFetchedAt: { type: Date, default: null },
        isFetching: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// ── Model cache (one model per collection name, never recreated) ────────────

const modelCache = new Map<string, Model<unknown>>();

function getOrCreateModel<T>(name: string, schema: Schema): Model<T> {
    if (modelCache.has(name)) return modelCache.get(name) as Model<T>;
    if (mongoose.models[name]) {
        modelCache.set(name, mongoose.models[name] as Model<T>);
        return mongoose.models[name] as Model<T>;
    }
    const collectionName = name
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
    const model = mongoose.model<T>(name, schema, collectionName);
    modelCache.set(name, model as Model<unknown>);
    return model;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ProfileModels {
    DailyMetrics: Model<IDailyMetrics>;
    DailyPlacementMetrics: Model<IDailyPlacementMetrics>;
    CampaignStructure: Model<ICampaignStructure>;
    CampaignCache: Model<ICampaignCache>;
    FetchLog: Model<IFetchLog>;
    CronSettings: Model<ICronSettings>;
}

/**
 * Returns Mongoose models scoped to a specific seller profile.
 * Collections are named like: premium_mart_daily_metrics, norcalway_fetch_log, etc.
 */
export function getProfileModels(profileId: string): ProfileModels {
    const prefix = getPrefix(profileId);
    // Model names use PascalCase (Mongoose requirement), collection names use snake_case
    const p = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    return {
        DailyMetrics: getOrCreateModel<IDailyMetrics>(`${p}DailyMetrics`, DailyMetricsSchema),
        DailyPlacementMetrics: getOrCreateModel<IDailyPlacementMetrics>(`${p}DailyPlacementMetrics`, DailyPlacementMetricsSchema),
        CampaignStructure: getOrCreateModel<ICampaignStructure>(`${p}CampaignStructure`, CampaignStructureSchema),
        CampaignCache: getOrCreateModel<ICampaignCache>(`${p}CampaignCache`, CampaignCacheSchema),
        FetchLog: getOrCreateModel<IFetchLog>(`${p}FetchLog`, FetchLogSchema),
        CronSettings: getOrCreateModel<ICronSettings>(`${p}CronSettings`, CronSettingsSchema),
    };
}

/** Get account display name for a profileId */
export function getProfileName(profileId: string): string {
    const names: Record<string, string> = {
        "1954065947972653": "Premium Mart",
        "404698923179134": "Norcalway",
    };
    return names[profileId] ?? `Account ${profileId}`;
}
