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

function getConfig(): AdsConfig | null {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID;
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_ADS_REFRESH_TOKEN;
  const profileId = process.env.AMAZON_ADS_PROFILE_ID;

  if (!clientId || !clientSecret || !refreshToken || !profileId) return null;
  return { clientId, clientSecret, refreshToken, profileId };
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

export async function fetchProfiles(): Promise<AdsProfile[]> {
  const config = getConfig();
  if (!config) throw new Error("Amazon Ads credentials not configured");

  const res = await adsRequest("/v2/profiles", config);
  if (!res.ok) throw new Error(`Profiles API error: ${res.status}`);
  return res.json();
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

interface RawCampaign {
  campaignId: number;
  name: string;
  state: string;
  budget: { budget: number; budgetType: string };
  startDate: string;
  endDate?: string;
  dynamicBidding?: { strategy: string };
  targetingType?: string;
}

export async function fetchCampaigns(): Promise<RawCampaign[]> {
  const config = getConfig();
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
  endDate: string
): Promise<ReportMetrics[]> {
  const config = getConfig();
  if (!config) throw new Error("Amazon Ads credentials not configured");

  // Request async report (v3 reporting)
  const reportBody = {
    name: `sp-campaigns-${startDate}-${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["campaign"],
      columns: [
        "campaignId",
        "campaignName",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "unitsSoldClicks7d",
        "sales7d",
      ],
      reportTypeId: "spCampaigns",
      timeUnit: "SUMMARY",
      format: "GZIP_JSON",
    },
  };

  const createRes = await adsRequest("/reporting/reports", config, {
    method: "POST",
    body: JSON.stringify(reportBody),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Report create error (${createRes.status}): ${txt}`);
  }

  const { reportId } = await createRes.json();

  // Poll for completion (max 120s = 60 polls × 2s)
  let reportUrl: string | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const statusRes = await adsRequest(
      `/reporting/reports/${reportId}`,
      config
    );
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    if (i % 5 === 0) {
      console.log(`[ADS Report] Poll ${i + 1}/60 — status: ${statusData.status}`);
    }
    if (statusData.status === "COMPLETED") {
      reportUrl = statusData.url;
      break;
    }
    if (statusData.status === "FAILURE") {
      throw new Error(`Report generation failed: ${statusData.failureReason}`);
    }
  }

  if (!reportUrl) throw new Error("Report timed out after 120s");

  // Download and decompress
  const dlRes = await fetch(reportUrl);
  if (!dlRes.ok) throw new Error(`Report download error: ${dlRes.status}`);

  // The response is gzipped JSON — use DecompressionStream if available
  let reportData: ReportMetrics[];
  try {
    const ds = new DecompressionStream("gzip");
    const decompressed = dlRes.body!.pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.value) chunks.push(result.value);
      done = result.done;
    }
    const text = new TextDecoder().decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c)))
    );
    reportData = JSON.parse(text);
  } catch {
    // Fallback: try reading as plain JSON
    const text = await dlRes.text();
    reportData = JSON.parse(text);
  }

  return reportData;
}

// ─── Advertised Products (ASINs) ────────────────────────────────────────────

interface RawProductAd {
  adId: number;
  campaignId: number;
  asin: string;
  state: string;
  sku?: string;
}

export async function fetchProductAds(): Promise<RawProductAd[]> {
  const config = getConfig();
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
