import { NextResponse } from "next/server";
import {
    isAmazonAdsConfigured,
    fetchProductAds,
} from "@/lib/amazon-ads";
import { MOCK_PRODUCTS } from "@/lib/mock-data";
import { Product } from "@/lib/types";

/**
 * GET /api/amazon/products
 *
 * Returns advertised products (ASINs).
 * Falls back to mock data if Amazon Ads API is not configured.
 */
export async function GET() {
    if (!isAmazonAdsConfigured()) {
        return NextResponse.json({
            success: true,
            source: "mock",
            data: MOCK_PRODUCTS,
            campaignProductMap: {},
        });
    }

    try {
        const rawAds = await fetchProductAds();

        // Deduplicate by ASIN
        const asinMap = new Map<string, Product>();
        // Build campaignId → asin[] mapping
        const campaignProductMap: Record<string, string[]> = {};

        for (const ad of rawAds) {
            if (!asinMap.has(ad.asin)) {
                asinMap.set(ad.asin, {
                    id: ad.asin,
                    asin: ad.asin,
                    name: ad.asin, // Amazon Ads API doesn't return product names — just ASIN
                });
            }

            // Map campaignId → list of ASINs
            const cid = String(ad.campaignId);
            if (!campaignProductMap[cid]) {
                campaignProductMap[cid] = [];
            }
            if (!campaignProductMap[cid].includes(ad.asin)) {
                campaignProductMap[cid].push(ad.asin);
            }
        }

        const products = Array.from(asinMap.values());

        console.log(`[Products] ${products.length} unique ASINs, ${Object.keys(campaignProductMap).length} campaigns mapped`);

        return NextResponse.json({
            success: true,
            source: "live",
            data: products,
            campaignProductMap,
        });
    } catch (err) {
        console.error("[Amazon Products API]", err);

        return NextResponse.json({
            success: true,
            source: "mock",
            error: String(err),
            data: MOCK_PRODUCTS,
            campaignProductMap: {},
        });
    }
}
