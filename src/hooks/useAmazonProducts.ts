"use client";

import { useState, useCallback, useEffect } from "react";
import { Product } from "@/lib/types";

interface UseProductsResult {
    products: Product[];
    campaignProductMap: Record<string, string[]>;
    loading: boolean;
    error: string | null;
    dataSource: "live" | "mock" | "loading";
}

export function useAmazonProducts(): UseProductsResult {
    const [products, setProducts] = useState<Product[]>([]);
    const [campaignProductMap, setCampaignProductMap] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<"live" | "mock" | "loading">(
        "loading"
    );

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/amazon/products");
            if (!res.ok) throw new Error(`API error: ${res.status}`);

            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Failed to fetch products");

            setProducts(json.data);
            setCampaignProductMap(json.campaignProductMap ?? {});
            setDataSource(json.source === "live" ? "live" : "mock");
        } catch (err) {
            setError(String(err));
            console.error("[useAmazonProducts]", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    return { products, campaignProductMap, loading, error, dataSource };
}
