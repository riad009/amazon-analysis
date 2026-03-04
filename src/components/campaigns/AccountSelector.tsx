"use client";

import { useState, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface AccountProfile {
    profileId: number;
    countryCode: string;
    accountInfo: {
        name: string;
        type: string;
        id: string;
    };
}

interface AccountSelectorProps {
    value: string;
    onChange: (profileId: string) => void;
}

export function AccountSelector({ value, onChange }: AccountSelectorProps) {
    const [profiles, setProfiles] = useState<AccountProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/amazon/profiles")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    // Filter to seller accounts only (skip vendor test accounts)
                    const sellers = json.data.filter(
                        (p: AccountProfile) => p.accountInfo?.type === "seller"
                    );
                    setProfiles(sellers);
                    // Auto-select current profile if not already set
                    if (!value && sellers.length > 0) {
                        onChange(String(sellers[0].profileId));
                    }
                }
            })
            .catch((err) => console.error("[AccountSelector]", err))
            .finally(() => setLoading(false));
    }, []);

    if (loading || profiles.length <= 1) return null;

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger size="sm" className="h-8 gap-1.5 text-xs min-w-[160px]">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent>
                {profiles.map((p) => (
                    <SelectItem key={p.profileId} value={String(p.profileId)}>
                        {p.accountInfo.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
