"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Lightbulb,
  TrendingUp,
  Settings,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: BarChart3,
    description: "Performance & AI actions",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: Lightbulb,
    description: "Timeline-aware AI analysis",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 border-r bg-background flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm leading-tight">SellerOS</p>
          <p className="text-[10px] text-muted-foreground leading-tight">PPC Intelligence</p>
        </div>
      </div>
      {/* Powered by */}
      <div className="px-5 py-2.5 border-b bg-muted/30">
        <p className="text-[10px] text-muted-foreground leading-tight">Powered by</p>
        <p className="text-sm font-bold text-foreground tracking-tight">Dra Soft</p>
      </div>

      {/* Brand context */}
      <div className="px-4 py-3 border-b">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1">Account</p>
        <p className="text-sm font-medium">Pete &amp; Mary</p>
        <p className="text-xs text-muted-foreground">US Marketplace</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, description }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all group",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{label}</p>
                <p
                  className={cn(
                    "text-[10px] truncate",
                    active ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                  {description}
                </p>
              </div>
              {active && <ChevronRight className="w-3 h-3 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t space-y-2">
        <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
        <p className="text-[10px] text-muted-foreground leading-tight">Powered by</p>
        <p className="text-sm font-bold text-foreground tracking-tight">Dra Soft</p>
      </div>
    </aside>
  );
}
