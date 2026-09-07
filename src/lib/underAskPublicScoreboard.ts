import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import type { UnderAskScoreboardEntry } from "@/lib/underAskPortfolio";

export type UnderAskScoreboardSummary = {
  traderCount: number;
  soldCount: number;
  totalProfit: number;
  bestRoi: number;
  averageRoi: number;
  selfReported: boolean;
};

const PUBLIC_HEADERS = {
  apikey: OTW_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function fetchPublicScoreboard(
  metric: "profit" | "roi",
  limit = 50,
): Promise<UnderAskScoreboardEntry[]> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_public_scoreboard`, {
    method: "POST",
    headers: PUBLIC_HEADERS,
    body: JSON.stringify({ p_metric: metric, p_limit: limit }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Could not load the public scoreboard.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row: any) => ({
        rank: n(row?.rank),
        displayName: s(row?.display_name) || "UnderAsk Trader",
        soldCount: n(row?.sold_count),
        totalProfit: n(row?.total_profit),
        bestRoi: n(row?.best_roi),
        metricValue: n(row?.metric_value),
        selfReported: Boolean(row?.self_reported),
      }))
    : [];
}

export async function fetchPublicScoreboardSummary(): Promise<UnderAskScoreboardSummary> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_public_scoreboard_summary`, {
    method: "POST",
    headers: PUBLIC_HEADERS,
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Could not load scoreboard totals.");
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    traderCount: n(row?.trader_count),
    soldCount: n(row?.sold_count),
    totalProfit: n(row?.total_profit),
    bestRoi: n(row?.best_roi),
    averageRoi: n(row?.average_roi),
    selfReported: Boolean(row?.self_reported),
  };
}
