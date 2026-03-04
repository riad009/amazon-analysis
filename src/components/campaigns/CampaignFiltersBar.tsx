"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampaignFilters } from "@/lib/types";
import { Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface CampaignFiltersBarProps {
  filters: CampaignFilters;
  onChange: (filters: CampaignFilters) => void;
  selectedCount: number;
  totalCount: number;
}

export function CampaignFiltersBar({
  filters,
  onChange,
  selectedCount,
  totalCount,
}: CampaignFiltersBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function set<K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function clearAll() {
    onChange({
      search: "",
      status: "All",
      biddingStrategy: "All",
      placement: "All",
      minAcos: "",
      maxAcos: "",
      minRoas: "",
      minSpend: "",
      maxSpend: "",
      minSales: "",
      maxSales: "",
      minClicks: "",
      minOrders: "",
      minImpressions: "",
      sortBy: "acos",
      sortDir: "desc",
      productId: "All",
    });
  }

  const hasBasicFilters =
    filters.search !== "" ||
    filters.status !== "All" ||
    filters.minAcos !== "" ||
    filters.maxAcos !== "";

  const hasAdvancedFilters =
    filters.biddingStrategy !== "All" ||
    filters.placement !== "All" ||
    filters.minRoas !== "" ||
    filters.minSpend !== "" ||
    filters.maxSpend !== "" ||
    filters.minSales !== "" ||
    filters.maxSales !== "" ||
    filters.minClicks !== "" ||
    filters.minOrders !== "" ||
    filters.minImpressions !== "";

  const hasFilters = hasBasicFilters || hasAdvancedFilters;

  const activeFilterCount = [
    filters.biddingStrategy !== "All",
    filters.placement !== "All",
    filters.minRoas !== "",
    filters.minSpend !== "" || filters.maxSpend !== "",
    filters.minSales !== "" || filters.maxSales !== "",
    filters.minClicks !== "",
    filters.minOrders !== "",
    filters.minImpressions !== "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      {/* Primary filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search campaigns…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            className="pl-8 h-8 w-[200px] text-sm"
          />
          {filters.search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => set("search", "")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select
          value={filters.status}
          onValueChange={(v) => set("status", v as CampaignFilters["status"])}
        >
          <SelectTrigger className="h-8 w-[130px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Status</SelectItem>
            <SelectItem value="Enabled">Enabled</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        {/* ACOS filter */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>ACOS:</span>
        </div>
        <Input
          placeholder="Min%"
          type="number"
          min={0}
          max={999}
          value={filters.minAcos}
          onChange={(e) =>
            set("minAcos", e.target.value === "" ? "" : Number(e.target.value))
          }
          className="h-8 w-[72px] text-sm"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          placeholder="Max%"
          type="number"
          min={0}
          max={999}
          value={filters.maxAcos}
          onChange={(e) =>
            set("maxAcos", e.target.value === "" ? "" : Number(e.target.value))
          }
          className="h-8 w-[72px] text-sm"
        />

        {/* Advanced filters toggle */}
        <Button
          variant={showAdvanced || hasAdvancedFilters ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More Filters
          {activeFilterCount > 0 && (
            <Badge variant="default" className="h-4 px-1.5 text-[10px] min-w-[18px] flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
          {showAdvanced ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </Button>

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5 text-muted-foreground"
            onClick={clearAll}
          >
            <X className="w-3.5 h-3.5" />
            Clear filters
          </Button>
        )}

        {/* Selection counter */}
        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCount} / {totalCount} selected
            </Badge>
          )}
          {selectedCount === 0 && (
            <span className="text-xs text-muted-foreground">
              {totalCount} campaign{totalCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Advanced filters row (expandable) */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 pl-1 pt-1 pb-1 border-t border-dashed">
          {/* Bidding Strategy */}
          <Select
            value={filters.biddingStrategy}
            onValueChange={(v) => set("biddingStrategy", v as CampaignFilters["biddingStrategy"])}
          >
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Bidding" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Bidding</SelectItem>
              <SelectItem value="Fixed Bid">Fixed Bid</SelectItem>
              <SelectItem value="Dynamic Bids - Down Only">Down Only</SelectItem>
              <SelectItem value="Dynamic Bids - Up and Down">Up & Down</SelectItem>
            </SelectContent>
          </Select>

          {/* Placement */}
          <Select
            value={filters.placement}
            onValueChange={(v) => set("placement", v)}
          >
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="Placement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Placement</SelectItem>
              <SelectItem value="TOS">Top of Search</SelectItem>
              <SelectItem value="PP">Product Page</SelectItem>
              <SelectItem value="ROS">Rest of Search</SelectItem>
            </SelectContent>
          </Select>

          <div className="w-px h-5 bg-border" />

          {/* Spend range */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Spend:</span>
          </div>
          <Input
            placeholder="Min $"
            type="number"
            min={0}
            value={filters.minSpend}
            onChange={(e) =>
              set("minSpend", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[72px] text-sm"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            placeholder="Max $"
            type="number"
            min={0}
            value={filters.maxSpend}
            onChange={(e) =>
              set("maxSpend", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[72px] text-sm"
          />

          <div className="w-px h-5 bg-border" />

          {/* Sales range */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Sales:</span>
          </div>
          <Input
            placeholder="Min $"
            type="number"
            min={0}
            value={filters.minSales}
            onChange={(e) =>
              set("minSales", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[72px] text-sm"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            placeholder="Max $"
            type="number"
            min={0}
            value={filters.maxSales}
            onChange={(e) =>
              set("maxSales", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[72px] text-sm"
          />

          <div className="w-px h-5 bg-border" />

          {/* Min Clicks */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Clicks ≥</span>
          </div>
          <Input
            placeholder="Min"
            type="number"
            min={0}
            value={filters.minClicks}
            onChange={(e) =>
              set("minClicks", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[64px] text-sm"
          />

          {/* Min Orders */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Orders ≥</span>
          </div>
          <Input
            placeholder="Min"
            type="number"
            min={0}
            value={filters.minOrders}
            onChange={(e) =>
              set("minOrders", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[64px] text-sm"
          />

          {/* Min Impressions */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Impr ≥</span>
          </div>
          <Input
            placeholder="Min"
            type="number"
            min={0}
            value={filters.minImpressions}
            onChange={(e) =>
              set("minImpressions", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[80px] text-sm"
          />

          {/* ROAS min */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>ROAS ≥</span>
          </div>
          <Input
            placeholder="Min"
            type="number"
            min={0}
            step={0.1}
            value={filters.minRoas}
            onChange={(e) =>
              set("minRoas", e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-8 w-[64px] text-sm"
          />
        </div>
      )}
    </div>
  );
}
