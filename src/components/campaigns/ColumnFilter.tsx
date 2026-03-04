"use client";

import { useState, useRef, useEffect } from "react";
import { Filter, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Operator = ">=" | "<=" | "=" | ">" | "<" | "!=";

export interface CheckboxFilterState {
    type: "checkbox";
    selected: Set<string>;
}

export interface NumericFilterState {
    type: "numeric";
    conditions: { operator: Operator; value: string }[];
    logic: "And" | "Or";
}

export type ColumnFilterState = CheckboxFilterState | NumericFilterState;

/* ─── Checkbox Column Filter ─────────────────────────────────────────────── */

export function CheckboxColumnFilter({
    options,
    current,
    onApply,
    onRemove,
    onClose,
}: {
    options: string[];
    current: Set<string>;
    onApply: (selected: Set<string>) => void;
    onRemove: () => void;
    onClose: () => void;
}) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set(current));

    const filtered = options.filter((o) =>
        o.toLowerCase().includes(search.toLowerCase())
    );

    const allVisible = filtered.every((o) => selected.has(o));

    function toggleAll() {
        const next = new Set(selected);
        if (allVisible) {
            filtered.forEach((o) => next.delete(o));
        } else {
            filtered.forEach((o) => next.add(o));
        }
        setSelected(next);
    }

    function toggle(option: string) {
        const next = new Set(selected);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        setSelected(next);
    }

    return (
        <div className="w-64 p-3 space-y-2">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Instant search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                />
            </div>

            {/* Select All */}
            <label className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-muted/50 rounded-sm">
                <Checkbox
                    checked={allVisible}
                    onCheckedChange={toggleAll}
                />
                <span className="text-sm">Select All</span>
            </label>

            {/* Options */}
            <div className="max-h-40 overflow-y-auto space-y-0.5">
                {filtered.map((o) => (
                    <label
                        key={o}
                        className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-muted/50 rounded-sm"
                    >
                        <Checkbox
                            checked={selected.has(o)}
                            onCheckedChange={() => toggle(o)}
                        />
                        <span className="text-sm">{o}</span>
                    </label>
                ))}
            </div>

            {/* Footer */}
            <p className="text-xs font-semibold text-foreground">
                {selected.size} item{selected.size !== 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => { onApply(selected); onClose(); }}
                >
                    Apply filter
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => { onRemove(); onClose(); }}
                >
                    Remove filter
                </Button>
            </div>
        </div>
    );
}

/* ─── Numeric Column Filter ──────────────────────────────────────────────── */

const OPERATORS: { value: Operator; label: string }[] = [
    { value: ">=", label: ">= More than or equal to" },
    { value: "<=", label: "<= Less than or equal to" },
    { value: ">", label: "> More than" },
    { value: "<", label: "< Less than" },
    { value: "=", label: "= Equal to" },
    { value: "!=", label: "!= Not equal to" },
];

export function NumericColumnFilter({
    current,
    onApply,
    onRemove,
    onClose,
}: {
    current?: NumericFilterState;
    onApply: (state: NumericFilterState) => void;
    onRemove: () => void;
    onClose: () => void;
}) {
    const [cond1Op, setCond1Op] = useState<Operator>(current?.conditions[0]?.operator ?? ">=");
    const [cond1Val, setCond1Val] = useState(current?.conditions[0]?.value ?? "");
    const [logic, setLogic] = useState<"And" | "Or">(current?.logic ?? "And");
    const [cond2Op, setCond2Op] = useState<Operator>(current?.conditions[1]?.operator ?? ">=");
    const [cond2Val, setCond2Val] = useState(current?.conditions[1]?.value ?? "");

    function handleApply() {
        const conditions: { operator: Operator; value: string }[] = [];
        if (cond1Val) conditions.push({ operator: cond1Op, value: cond1Val });
        if (cond2Val) conditions.push({ operator: cond2Op, value: cond2Val });
        if (conditions.length > 0) {
            onApply({ type: "numeric", conditions, logic });
        }
        onClose();
    }

    return (
        <div className="w-[280px] p-4 space-y-4 box-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Show items with value that:
            </p>

            {/* Condition 1 */}
            <div className="flex flex-col gap-2 w-full max-w-full overflow-hidden">
                <select
                    value={cond1Op}
                    onChange={(e) => setCond1Op(e.target.value as Operator)}
                    className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap"
                >
                    {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                </select>
                <input
                    type="number"
                    value={cond1Val}
                    onChange={(e) => setCond1Val(e.target.value)}
                    placeholder="Enter value"
                    className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                />
            </div>

            {/* Logic operator */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <select
                    value={logic}
                    onChange={(e) => setLogic(e.target.value as "And" | "Or")}
                    className="h-7 px-3 text-xs border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer font-medium"
                >
                    <option value="And">And</option>
                    <option value="Or">Or</option>
                </select>
                <div className="flex-1 h-px bg-border" />
            </div>

            {/* Condition 2 */}
            <div className="flex flex-col gap-2 w-full max-w-full overflow-hidden">
                <select
                    value={cond2Op}
                    onChange={(e) => setCond2Op(e.target.value as Operator)}
                    className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap"
                >
                    {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                </select>
                <input
                    type="number"
                    value={cond2Val}
                    onChange={(e) => setCond2Val(e.target.value)}
                    placeholder="Enter value"
                    className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
                <Button
                    size="sm"
                    className="flex-1 h-8 text-xs font-medium"
                    onClick={handleApply}
                >
                    Apply filter
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs font-medium"
                    onClick={() => { onRemove(); onClose(); }}
                >
                    Remove filter
                </Button>
            </div>
        </div>
    );
}

/* ─── Filter Toggle Button ───────────────────────────────────────────────── */

export function ColumnFilterTrigger({
    isActive,
    onClick,
}: {
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
}) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(e); }}
            className={`ml-0.5 p-0.5 rounded hover:bg-muted/80 transition-colors ${isActive ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            title="Filter column"
        >
            <Filter className={`w-3 h-3 ${isActive ? "fill-primary/30" : ""}`} />
        </button>
    );
}

/* ─── Filter Dropdown Wrapper ────────────────────────────────────────────── */

export function ColumnFilterDropdown({
    open,
    onClose,
    anchorRef,
    children,
}: {
    open: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
    children: React.ReactNode;
}) {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!open || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        // Position below the header, clamped to viewport
        const left = Math.min(rect.left, window.innerWidth - 300);
        setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }, [open, anchorRef]);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                anchorRef.current &&
                !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open, onClose, anchorRef]);

    if (!open) return null;

    return (
        <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-popover border rounded-xl shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
}

/* ─── Filter logic helpers ───────────────────────────────────────────────── */

function compareNumeric(value: number, operator: Operator, target: number): boolean {
    switch (operator) {
        case ">=": return value >= target;
        case "<=": return value <= target;
        case ">": return value > target;
        case "<": return value < target;
        case "=": return value === target;
        case "!=": return value !== target;
        default: return true;
    }
}

export function applyColumnFilters(
    campaigns: any[],
    filters: Map<string, ColumnFilterState>
): any[] {
    if (filters.size === 0) return campaigns;

    return campaigns.filter((c) => {
        for (const [key, filter] of filters) {
            if (filter.type === "checkbox") {
                if (filter.selected.size === 0) continue;
                const val = String(c[key] ?? "");
                if (!filter.selected.has(val)) return false;
            } else if (filter.type === "numeric") {
                const val = Number(c[key] ?? 0);
                const results = filter.conditions
                    .filter((cond) => cond.value !== "")
                    .map((cond) => compareNumeric(val, cond.operator, Number(cond.value)));
                if (results.length === 0) continue;
                if (filter.logic === "And") {
                    if (!results.every(Boolean)) return false;
                } else {
                    if (!results.some(Boolean)) return false;
                }
            }
        }
        return true;
    });
}
