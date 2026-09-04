import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import type { PlanId } from "@/lib/searchPlans";

export type UnderAskUsage = {
  plan: PlanId;
  used: number;
  limit: number;
  remaining: number;
  periodDays: number;
};

export type UnderAskSearchHistoryItem = {
  id: string;
  plan: PlanId;
  query: string;
  preferredSites: string[];
  minRoi: number | null;
  minScore: number | null;
  status: "started" | "completed" | "failed";
  resultCount: number | null;
  errorCode: string | null;
  createdAt: string;
};

function normalizePlan(value: unknown): PlanId {
  return value === "pro" || value === "multi-pro" || value === "business"
    ? value
    : "scout";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function authHeaders(accessToken: string) {
  return {
    apikey: OTW_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchUnderAskUsage(accessToken: string): Promise<UnderAskUsage> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_my_usage`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Could not load search usage.");
  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;

  return {
    plan: normalizePlan(row?.plan),
    used: Number(row?.used) || 0,
    limit: Number(row?.search_limit) || 0,
    remaining: Number(row?.remaining) || 0,
    periodDays: Number(row?.period_days) || 30,
  };
}

export async function fetchUnderAskSearchHistory(
  accessToken: string,
  limit = 50,
): Promise<UnderAskSearchHistoryItem[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const select = [
    "id",
    "plan",
    "query",
    "preferred_sites",
    "min_roi",
    "min_score",
    "status",
    "result_count",
    "error_code",
    "created_at",
  ].join(",");

  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_search_usage?select=${select}&order=created_at.desc&limit=${safeLimit}`,
    {
      headers: authHeaders(accessToken),
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load search history.");
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];

  return rows.map((row: any) => ({
    id: String(row?.id || ""),
    plan: normalizePlan(row?.plan),
    query: typeof row?.query === "string" ? row.query : "",
    preferredSites: Array.isArray(row?.preferred_sites)
      ? row.preferred_sites.filter((site: unknown): site is string => typeof site === "string")
      : [],
    minRoi: nullableNumber(row?.min_roi),
    minScore: nullableNumber(row?.min_score),
    status:
      row?.status === "completed" || row?.status === "failed" ? row.status : "started",
    resultCount: nullableNumber(row?.result_count),
    errorCode: typeof row?.error_code === "string" ? row.error_code : null,
    createdAt: typeof row?.created_at === "string" ? row.created_at : "",
  }));
}
