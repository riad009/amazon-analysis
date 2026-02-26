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
        });
    }

    try {
        const rawAds = await fetchProductAds();

        // Deduplicate by ASIN
        const asinMap = new Map<string, Product>();
        for (const ad of rawAds) {
            if (!asinMap.has(ad.asin)) {
                asinMap.set(ad.asin, {
                    id: ad.asin,
                    asin: ad.asin,
                    name: ad.asin, // Amazon Ads API doesn't return product names — just ASIN
                });
            }
        }

        const products = Array.from(asinMap.values());

        return NextResponse.json({
            success: true,
            source: "live",
            data: products,
        });
    } catch (err) {
        console.error("[Amazon Products API]", err);

        return NextResponse.json({
            success: true,
            source: "mock",
            error: String(err),
            data: MOCK_PRODUCTS,
        });
    }
}
