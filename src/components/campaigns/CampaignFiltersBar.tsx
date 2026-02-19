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
import { Search, SlidersHorizontal, X } from "lucide-react";

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
  function set<K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function clearAll() {
    onChange({
      search: "",
      status: "All",
      minAcos: "",
      maxAcos: "",
      minRoas: "",
      sortBy: "acos",
      sortDir: "desc",
      productId: "All",
    });
  }

  const hasFilters =
    filters.search !== "" ||
    filters.status !== "All" ||
    filters.minAcos !== "" ||
    filters.maxAcos !== "" ||
    filters.minRoas !== "";

  return (
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
  );
}
