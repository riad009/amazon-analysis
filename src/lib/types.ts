// ─── Core Domain Types ──────────────────────────────────────────────────────

export type CampaignStatus = "Enabled" | "Paused" | "Archived";
export type BiddingStrategy = "Fixed Bid" | "Dynamic Bids - Down Only" | "Dynamic Bids - Up and Down";
export type MatchType = "Broad" | "Phrase" | "Exact";
export type AIConfidence = "High" | "Medium" | "Low";
export type AIAction = "approve" | "deny" | "modify";
export type InsightSeverity = "critical" | "warning" | "opportunity" | "info";
export type InsightCategory =
  | "top_of_search_loss"
  | "over_optimized"
  | "declining"
  | "dying"
  | "improving"
  | "budget_limited";

// ─── Product ────────────────────────────────────────────────────────────────

export interface Product {
  asin: string;
  id: string;
  name: string;
  imageUrl?: string;
}

// ─── Campaign ───────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  type: "SP Manual" | "SP Auto" | "SB" | "SD";
  status: CampaignStatus;
  dailyBudget: number;
  startDate: string;
  biddingStrategy: BiddingStrategy;
  portfolio: string;
  productIds: string[];

  // Metrics (current period)
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
  sales: number;
  conversion: number; // %
  spend: number;
  cpc: number;
  ctr: number; // %
  acos: number; // %
  roas: number;

  // Previous period metrics
  prevImpressions?: number;
  prevClicks?: number;
  prevOrders?: number;
  prevSales?: number;
  prevSpend?: number;
  prevAcos?: number;
  prevRoas?: number;

  // AI suggestions
  aiSuggestions: AISuggestion[];
}

// ─── AI Suggestion ──────────────────────────────────────────────────────────

export interface AISuggestion {
  id: string;
  campaignId: string;
  type:
    | "raise_bid"
    | "lower_bid"
    | "increase_budget"
    | "decrease_budget"
    | "pause_campaign"
    | "enable_campaign"
    | "add_negative_keyword"
    | "adjust_placement";
  title: string;
  description: string;
  rationale: string;
  impact: string;
  confidence: AIConfidence;
  recommendedValue?: number | string;
  currentValue?: number | string;
  unit?: string;
  status: "pending" | "approved" | "denied" | "modified";
  userNote?: string;
  createdAt: string;
}

// ─── Change History ──────────────────────────────────────────────────────────

export interface ChangeEvent {
  id: string;
  campaignId: string;
  campaignName: string;
  changeType: "bid" | "budget" | "status" | "keyword" | "placement";
  field: string;
  oldValue: string | number;
  newValue: string | number;
  changedAt: string;
  changedBy: "user" | "automation";
}

// ─── Insight ────────────────────────────────────────────────────────────────

export interface Insight {
  id: string;
  campaignId: string;
  campaignName: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  whatChanged: string;
  likelyCause: string;
  recommendedAction: string;
  confidence: AIConfidence;
  confidenceScore: number; // 0–100
  metrics: {
    label: string;
    current: number | string;
    previous: number | string;
    change: number; // % change
    unit?: string;
  }[];
  structuredAction: AISuggestion;
  relatedChangeEvent?: ChangeEvent;
  detectedAt: string;
}

// ─── Date Range ──────────────────────────────────────────────────────────────

export type DateRangePreset = "7d" | "14d" | "30d" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

// ─── Filter State ────────────────────────────────────────────────────────────

export interface CampaignFilters {
  search: string;
  status: CampaignStatus | "All";
  minAcos: number | "";
  maxAcos: number | "";
  minRoas: number | "";
  sortBy: keyof Campaign;
  sortDir: "asc" | "desc";
  productId: string | "All";
}
