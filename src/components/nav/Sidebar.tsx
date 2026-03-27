"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Lightbulb,
  TrendingUp,
  Database,
  Bell,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

interface AccountProfile {
  profileId: number;
  countryCode: string;
  accountInfo: { name: string; type: string };
}

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
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    description: "Email alerts & schedule",
  },
  {
    href: "/manage-data",
    label: "Manage Data",
    icon: Database,
    description: "Fetch schedule & history",
  },
];


export function Sidebar() {
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<AccountProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetch("/api/amazon/profiles")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const sellers = json.data.filter(
            (p: AccountProfile) => p.accountInfo?.type === "seller"
          );
          setProfiles(sellers);
          if (sellers.length > 0) {
            setSelectedProfile(sellers[0]);
            const pid = String(sellers[0].profileId);
            // Persist so other pages can read it on mount
            try { localStorage.setItem("selectedProfileId", pid); } catch {}
            // Fire initial account selection so CampaignsPage knows which profile to load
            window.dispatchEvent(
              new CustomEvent("account-changed", {
                detail: { profileId: pid, name: sellers[0].accountInfo.name },
              })
            );
          }
        }
      })
      .catch((err) => console.error("[Sidebar]", err));
  }, []);

  function handleSelectAccount(profile: AccountProfile) {
    setSelectedProfile(profile);
    setDropdownOpen(false);
    const pid = String(profile.profileId);
    try { localStorage.setItem("selectedProfileId", pid); } catch {}
    // Notify campaigns page about account change
    window.dispatchEvent(
      new CustomEvent("account-changed", {
        detail: { profileId: pid, name: profile.accountInfo.name },
      })
    );
  }

  const countryLabel =
    selectedProfile?.countryCode === "US" ? "US Marketplace" :
      selectedProfile?.countryCode === "CA" ? "CA Marketplace" :
        selectedProfile?.countryCode ? `${selectedProfile.countryCode} Marketplace` : "";

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

      {/* Account selector */}
      <div className="px-4 py-3 border-b relative">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1">Account</p>
        {profiles.length > 1 ? (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between group hover:opacity-80 transition-opacity"
            >
              <div className="text-left">
                <p className="text-sm font-medium">{selectedProfile?.accountInfo.name ?? "Loading..."}</p>
                <p className="text-xs text-muted-foreground">{countryLabel}</p>
              </div>
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1">
                  {profiles.map((p) => (
                    <button
                      key={p.profileId}
                      onClick={() => handleSelectAccount(p)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors",
                        selectedProfile?.profileId === p.profileId && "bg-muted font-medium"
                      )}
                    >
                      <p className="font-medium text-xs">{p.accountInfo.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.countryCode === "US" ? "US Marketplace" : `${p.countryCode} Marketplace`}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium">{selectedProfile?.accountInfo.name ?? "Loading..."}</p>
            <p className="text-xs text-muted-foreground">{countryLabel}</p>
          </div>
        )}
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
        <p className="text-[10px] text-muted-foreground leading-tight">Powered by</p>
        <p className="text-sm font-bold text-foreground tracking-tight">Dra Soft</p>
      </div>
    </aside>
  );
}

