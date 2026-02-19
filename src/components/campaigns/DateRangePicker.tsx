"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, ChevronDown } from "lucide-react";
import { DateRange, DateRangePreset } from "@/lib/types";
import { format, subDays } from "date-fns";

interface DateRangePickerProps {
  preset: DateRangePreset;
  range: DateRange;
  onPresetChange: (preset: DateRangePreset, range: DateRange) => void;
}

const PRESETS: { label: string; value: DateRangePreset; days?: number }[] = [
  { label: "Last 7 Days", value: "7d", days: 7 },
  { label: "Last 14 Days", value: "14d", days: 14 },
  { label: "Last 30 Days", value: "30d", days: 30 },
  { label: "Custom", value: "custom" },
];

export function DateRangePicker({ preset, range, onPresetChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(range.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(range.to);

  const label =
    preset === "custom"
      ? `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yy")}`
      : PRESETS.find((p) => p.value === preset)?.label ?? "Select range";

  function applyPreset(p: typeof PRESETS[number]) {
    if (p.value === "custom") return;
    const to = new Date();
    const from = subDays(to, p.days! - 1);
    onPresetChange(p.value, { from, to });
    setOpen(false);
  }

  function applyCustom() {
    if (customFrom && customTo) {
      onPresetChange("custom", { from: customFrom, to: customTo });
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 h-9 text-sm font-medium">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {label}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Preset list */}
          <div className="border-r p-3 space-y-1 min-w-[150px]">
            {PRESETS.filter((p) => p.value !== "custom").map((p) => (
              <button
                key={p.value}
                onClick={() => applyPreset(p)}
                className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                  preset === p.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="pt-1 border-t mt-1">
              <p className="text-xs text-muted-foreground px-3 py-1">Custom range</p>
            </div>
          </div>
          {/* Calendar */}
          <div className="p-3">
            <div className="flex gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">From</p>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={setCustomFrom}
                  disabled={(d) => (customTo ? d > customTo : false)}
                  className="rounded-md border"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">To</p>
                <Calendar
                  mode="single"
                  selected={customTo}
                  onSelect={setCustomTo}
                  disabled={(d) => (customFrom ? d < customFrom : false)}
                  className="rounded-md border"
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={applyCustom} disabled={!customFrom || !customTo}>
                Apply Custom Range
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
