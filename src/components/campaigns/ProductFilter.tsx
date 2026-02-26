"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronDown, Package, X } from "lucide-react";
import { Product } from "@/lib/types";

interface ProductFilterProps {
  products: Product[];
  selectedProductId: string | "All";
  onChange: (productId: string | "All") => void;
}

export function ProductFilter({ products, selectedProductId, onChange }: ProductFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.asin.toLowerCase().includes(search.toLowerCase())
  );

  function select(p: Product | null) {
    onChange(p ? p.id : "All");
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 h-9 text-sm font-medium max-w-[260px]"
        >
          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate">
            {selectedProduct ? selectedProduct.name.slice(0, 28) + "…" : "All Products"}
          </span>
          {selectedProductId !== "All" && (
            <X
              className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChange("All");
              }}
            />
          )}
          {selectedProductId === "All" && (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search products or ASIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[280px] overflow-auto">
          <button
            onClick={() => select(null)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left border-b hover:bg-muted transition-colors ${selectedProductId === "All" ? "bg-muted font-medium" : ""
              }`}
          >
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
            <span>All Products</span>
          </button>
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => select(p)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors ${selectedProductId === p.id ? "bg-primary/10 font-medium" : ""
                }`}
            >
              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 text-xs font-mono text-muted-foreground">
                {p.asin.slice(0, 4)}
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.asin}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No products found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
