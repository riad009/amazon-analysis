import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CACHE_DIR = process.env.VERCEL
    ? path.join("/tmp", ".cache")
    : path.join(process.cwd(), ".cache");

function getDateLabel(dateKey: string): string {
    if (!dateKey || !dateKey.includes("|")) return dateKey || "Unknown";
    const [from, to] = dateKey.split("|");
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    if (days <= 8) return "Last 7 Days";
    if (days <= 15) return "Last 14 Days";
    if (days <= 31) return "Last 30 Days";
    return `${from} to ${to} (${days}d)`;
}

export async function GET() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            return NextResponse.json({ success: true, files: [], totalSizeKB: 0 });
        }
        const cacheFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".json"));
        const files = [];
        let totalSize = 0;
        for (const fileName of cacheFiles) {
            const filePath = path.join(CACHE_DIR, fileName);
            try {
                const stat = fs.statSync(filePath);
                const raw = fs.readFileSync(filePath, "utf-8");
                const data = JSON.parse(raw);
                const sizeKB = Math.round(stat.size / 1024);
                totalSize += sizeKB;
                files.push({
                    dateKey: data.dateKey ?? "",
                    label: getDateLabel(data.dateKey ?? fileName),
                    campaigns: data.campaigns?.length ?? 0,
                    metricsAvailable: data.metricsAvailable ?? false,
                    fetchedAt: data.fetchedAt ?? 0,
                    ageSeconds: Math.round((Date.now() - (data.fetchedAt ?? 0)) / 1000),
                    filePath: fileName,
                    fileSizeKB: sizeKB,
                });
            } catch { /* skip corrupt files */ }
        }
        files.sort((a, b) => a.label.localeCompare(b.label));
        return NextResponse.json({ success: true, files, totalSizeKB: totalSize });
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        if (fs.existsSync(CACHE_DIR)) {
            const files = fs.readdirSync(CACHE_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(CACHE_DIR, file));
            }
            console.log("[Cache] Cleared " + files.length + " cache files");
        }
        return NextResponse.json({ success: true, message: "Cache cleared" });
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
