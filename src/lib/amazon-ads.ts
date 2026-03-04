/**
 * Amazon Advertising API Client (Server-side only)
 *
 * Handles OAuth2 token refresh, campaign listing, async report generation,
 * and product catalog lookups via Login with Amazon (LwA).
 *
 * Required env vars:
 *   AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET,
 *   AMAZON_ADS_REFRESH_TOKEN, AMAZON_ADS_PROFILE_ID
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const ADS_API_BASE = "https://advertising-api.amazon.com"; // NA region

interface AdsConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId: string;
}

function getConfig(overrideProfileId?: string): AdsConfig | null {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID;
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_ADS_REFRESH_TOKEN;
  const profileId = overrideProfileId ?? process.env.AMAZON_ADS_PROFILE_ID;

  if (!clientId || !clientSecret || !refreshToken || !profileId) return null;
  return { clientId, clientSecret, refreshToken, profileId };
}

export function getDefaultProfileId(): string | undefined {
  return process.env.AMAZON_ADS_PROFILE_ID;
}

export function isAmazonAdsConfigured(): boolean {
  return getConfig() !== null;
}

// ─── Token Cache ─────────────────────────────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(config: AdsConfig): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LwA token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedAccessToken!;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function adsRequest(
  path: string,
  config: AdsConfig,
  options: { method?: string; body?: string; contentType?: string; accept?: string } = {}
) {
  const token = await getAccessToken(config);
  const url = path.startsWith("http") ? path : `${ADS_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Amazon-Advertising-API-ClientId": config.clientId,
    "Amazon-Advertising-API-Scope": config.profileId,
    "Content-Type": options.contentType ?? "application/json",
    Accept: options.accept ?? "application/json",
  };

  console.log(`[ADS API] ${options.method ?? "GET"} ${url} | profileId=${config.profileId} | Content-Type=${headers["Content-Type"]}`);

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  return res;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export interface AdsProfile {
  profileId: number;
  countryCode: string;
  accountInfo: {
    marketplaceStringId: string;
    id: string;
    type: string;
    name: string;
  };
}

export async function fetchProfiles(profileId?: string): Promise<AdsProfile[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const res = await adsRequest("/v2/profiles", config);
  if (!res.ok) throw new Error(`Profiles API error: ${res.status}`);
  return res.json();
}

// ─── Portfolios ──────────────────────────────────────────────────────────────

export interface AdsPortfolio {
  portfolioId: number;
  name: string;
  state: string;
  budget?: { amount: number; policy: string };
}

export async function fetchPortfolios(profileId?: string): Promise<AdsPortfolio[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  // v3 portfolios endpoint (v2 was deprecated March 2025)
  const res = await adsRequest("/portfolios/list", config, {
    method: "POST",
    body: JSON.stringify({ maxResults: 100 }),
    contentType: "application/json",
    accept: "application/json",
  });

  if (!res.ok) {
    // Fallback: try listing without body
    const res2 = await adsRequest("/v2/portfolios", config);
    if (!res2.ok) {
      console.warn(`[ADS] Portfolios API error: v3=${res.status}, v2=${res2.status}`);
      return [];
    }
    const data2 = await res2.json();
    console.log(`[ADS] Fetched ${data2.length} portfolios (v2 fallback)`);
    return data2;
  }

  const data = await res.json();
  const portfolios = data.portfolios ?? data;
  console.log(`[ADS] Fetched ${Array.isArray(portfolios) ? portfolios.length : 0} portfolios (v3)`);
  return Array.isArray(portfolios) ? portfolios : [];
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

interface RawCampaign {
  campaignId: number;
  name: string;
  state: string;
  portfolioId?: number;
  budget: { budget: number; budgetType: string };
  startDate: string;
  endDate?: string;
  dynamicBidding?: {
    strategy: string;
    placementBidding?: { placement: string; percentage: number }[];
  };
  targetingType?: string;
}

export async function fetchCampaigns(profileId?: string): Promise<RawCampaign[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  // SP Campaigns v3
  const allCampaigns: RawCampaign[] = [];
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      maxResults: 100,
      stateFilter: { include: ["ENABLED", "PAUSED"] },
    };
    if (nextToken) body.nextToken = nextToken;

    const res = await adsRequest("/sp/campaigns/list", config, {
      method: "POST",
      body: JSON.stringify(body),
      contentType: "application/vnd.spCampaign.v3+json",
      accept: "application/vnd.spCampaign.v3+json",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Campaigns API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    allCampaigns.push(...(data.campaigns ?? []));
    nextToken = data.nextToken;
  } while (nextToken);

  return allCampaigns;
}

// ─── Campaign Performance Report ───────────────────────────────────────────

interface ReportMetrics {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  purchases7d: number;
  unitsSoldClicks7d: number;
  sales7d: number;
}

export async function fetchCampaignReport(
  startDate: string,
  endDate: string,
  profileId?: string
): Promise<ReportMetrics[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const start = Date.now();

  // Try v2 first (faster: 5-30s, single-date snapshot)
  try {
    console.log(`[ADS Report] ⏳ Trying v2 report for ${endDate}...`);
    const data = await fetchReportV2(config, endDate);
    console.log(`[ADS Report] ✅ v2 done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${data.length} rows`);
    return data;
  } catch (v2Err) {
    console.warn(`[ADS Report] v2 failed (${((Date.now() - start) / 1000).toFixed(1)}s):`, String(v2Err).slice(0, 100));
  }

  // Fallback to v3 (slower but supports date ranges)
  console.log(`[ADS Report] ⏳ Falling back to v3 for ${startDate} → ${endDate}...`);
  const data = await fetchReportV3(config, startDate, endDate);
  console.log(`[ADS Report] ✅ v3 done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${data.length} rows`);
  return data;
}

// ── v2 Report (faster, single-date snapshot) ──────────────────────────────

async function fetchReportV2(config: AdsConfig, reportDate: string): Promise<ReportMetrics[]> {
  const body = {
    reportDate,
    metrics: "campaignId,campaignName,impressions,clicks,cost,attributedSales7d,attributedConversions7d,attributedUnitsOrdered7d",
  };

  console.log(`[ADS Report v2] Creating report for ${reportDate}...`);
  const createRes = await adsRequest("/v2/sp/campaigns/report", config, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`v2 create error (${createRes.status}): ${txt}`);
  }

  const { reportId } = await createRes.json();
  if (!reportId) throw new Error("v2: no reportId returned");

  // Poll (v2 is faster: max 60s)
  let reportUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await adsRequest(`/v2/reports/${reportId}`, config);
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    if (i % 3 === 0) console.log(`[ADS Report v2] Poll ${i + 1}/30 — status: ${statusData.status}`);

    if (statusData.status === "SUCCESS") { reportUrl = statusData.location; break; }
    if (statusData.status === "FAILURE") throw new Error(`v2 report failed: ${statusData.statusDetails}`);
  }

  if (!reportUrl) throw new Error("v2 report timed out after 60s");

  // Download and decompress
  const rawReport = await downloadGzipJson(reportUrl);

  const metrics: ReportMetrics[] = rawReport.map((row: Record<string, unknown>) => ({
    campaignId: String(row.campaignId ?? ""),
    campaignName: String(row.campaignName ?? ""),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    cost: Number(row.cost ?? 0),
    purchases7d: Number(row.attributedConversions7d ?? 0),
    unitsSoldClicks7d: Number(row.attributedUnitsOrdered7d ?? 0),
    sales7d: Number(row.attributedSales7d ?? 0),
  }));

  console.log(`[ADS Report v2] ✅ ${metrics.length} campaigns with metrics`);
  return metrics;
}

// ── v3 Report (slower, supports date ranges) ──────────────────────────────

async function fetchReportV3(config: AdsConfig, startDate: string, endDate: string): Promise<ReportMetrics[]> {
  const body = {
    name: `sp-campaigns-${startDate}-${endDate}`,
    startDate, endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["campaign"],
      columns: ["campaignId", "campaignName", "impressions", "clicks", "cost", "purchases7d", "unitsSoldClicks7d", "sales7d"],
      reportTypeId: "spCampaigns",
      timeUnit: "SUMMARY",
      format: "GZIP_JSON",
    },
  };

  console.log(`[ADS Report v3] Creating report for ${startDate} to ${endDate}...`);
  const createRes = await adsRequest("/reporting/reports", config, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`v3 create error (${createRes.status}): ${txt}`);
  }

  const { reportId } = await createRes.json();

  // Poll up to 100 times × 3s = 300s max (Amazon reports can be slow)
  let reportUrl: string | null = null;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await adsRequest(`/reporting/reports/${reportId}`, config);
    if (!statusRes.ok) continue;
    const d = await statusRes.json();
    if (i % 10 === 0) console.log(`[ADS Report v3] Poll ${i + 1}/100 — status: ${d.status} (${((i + 1) * 3)}s elapsed)`);
    if (d.status === "COMPLETED") { reportUrl = d.url; break; }
    if (d.status === "FAILURE") throw new Error(`v3 failed: ${d.failureReason}`);
  }

  if (!reportUrl) throw new Error("v3 report timed out after 300s");

  const data = await downloadGzipJson(reportUrl);
  console.log(`[ADS Report v3] ✅ ${data.length} campaigns with metrics`);
  return data as unknown as ReportMetrics[];
}

// ── Helper: download and decompress gzip JSON ─────────────────────────────

async function downloadGzipJson(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download error: ${res.status}`);

  try {
    const ds = new DecompressionStream("gzip");
    const decompressed = res.body!.pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.value) chunks.push(result.value);
      done = result.done;
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return JSON.parse(text);
  } catch {
    const text = await res.text();
    return JSON.parse(text);
  }
}

// ─── Placement Report (per-campaign, per-placement metrics) ─────────────────

export interface PlacementReportRow {
  campaignId: string;
  placementClassification: string;
  impressions: number;
  clicks: number;
  cost: number;
  purchases7d: number;
  unitsSoldClicks7d: number;
  sales7d: number;
}

export async function fetchPlacementReport(
  campaignId: string,
  startDate: string,
  endDate: string,
  profileId?: string
): Promise<PlacementReportRow[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const body = {
    name: `sp-placements-${startDate}-${endDate}-${Date.now()}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["campaign", "campaignPlacement"],
      columns: [
        "campaignId", "placementClassification",
        "impressions", "clicks", "cost",
        "purchases7d", "unitsSoldClicks7d", "sales7d",
      ],
      reportTypeId: "spCampaigns",
      timeUnit: "SUMMARY",
      format: "GZIP_JSON",
    },
  };

  console.log(`[ADS Placement] ⏳ Creating placement report for campaign ${campaignId} (${startDate} → ${endDate})...`);
  const createRes = await adsRequest("/reporting/reports", config, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Placement report create error (${createRes.status}): ${txt}`);
  }

  const { reportId } = await createRes.json();

  // Poll up to 60 times × 3s = 180s max
  let reportUrl: string | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await adsRequest(`/reporting/reports/${reportId}`, config);
    if (!statusRes.ok) continue;
    const d = await statusRes.json();
    if (i % 5 === 0) console.log(`[ADS Placement] Poll ${i + 1}/60 — status: ${d.status}`);
    if (d.status === "COMPLETED") { reportUrl = d.url; break; }
    if (d.status === "FAILURE") throw new Error(`Placement report failed: ${d.failureReason}`);
  }

  if (!reportUrl) throw new Error("Placement report timed out after 180s");

  const data = await downloadGzipJson(reportUrl);
  // Filter to the requested campaign (API doesn't support campaignId filter with campaignPlacement groupBy)
  // When campaignId is "__all__", return all rows (used for bulk pre-loading)
  const filtered = campaignId === "__all__" ? data : data.filter((row) => String(row.campaignId) === campaignId);
  console.log(`[ADS Placement] ✅ ${filtered.length} placement rows${campaignId === "__all__" ? " (all campaigns)" : ` for campaign ${campaignId}`} (${data.length} total)`);
  return filtered as unknown as PlacementReportRow[];
}

// ─── Keywords ───────────────────────────────────────────────────────────────

export interface RawKeyword {
  keywordId: number;
  campaignId: number;
  adGroupId: number;
  keywordText: string;
  matchType: string; // BROAD | PHRASE | EXACT
  state: string;
  bid: number;
}

export async function fetchKeywords(profileId?: string): Promise<RawKeyword[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const allKeywords: RawKeyword[] = [];
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      maxResults: 100,
      stateFilter: { include: ["ENABLED", "PAUSED"] },
    };
    if (nextToken) body.nextToken = nextToken;

    const res = await adsRequest("/sp/keywords/list", config, {
      method: "POST",
      body: JSON.stringify(body),
      contentType: "application/vnd.spKeyword.v3+json",
      accept: "application/vnd.spKeyword.v3+json",
    });

    if (!res.ok) break;

    const data = await res.json();
    allKeywords.push(...(data.keywords ?? []));
    nextToken = data.nextToken;
  } while (nextToken);

  console.log(`[ADS] Fetched ${allKeywords.length} keywords`);
  return allKeywords;
}

// ─── Advertised Products (ASINs) ────────────────────────────────────────────

interface RawProductAd {
  adId: number;
  campaignId: number;
  asin: string;
  state: string;
  sku?: string;
}

export async function fetchProductAds(profileId?: string): Promise<RawProductAd[]> {
  const config = getConfig(profileId);
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const allAds: RawProductAd[] = [];
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      maxResults: 100,
      stateFilter: { include: ["ENABLED", "PAUSED"] },
    };
    if (nextToken) body.nextToken = nextToken;

    const res = await adsRequest("/sp/productAds/list", config, {
      method: "POST",
      body: JSON.stringify(body),
      contentType: "application/vnd.spProductAd.v3+json",
      accept: "application/vnd.spProductAd.v3+json",
    });

    if (!res.ok) break;

    const data = await res.json();
    allAds.push(...(data.productAds ?? []));
    nextToken = data.nextToken;
  } while (nextToken);

  return allAds;
}
