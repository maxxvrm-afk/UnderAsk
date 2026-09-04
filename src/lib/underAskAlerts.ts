import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

export type UnderAskDealAlert = {
  id: string;
  savedSearchId: string;
  title: string;
  url: string;
  source: string;
  askPrice: number | null;
  expectedSalePrice: number | null;
  netProfit: number | null;
  roiPercent: number | null;
  dealScore: number;
  reasoning: string | null;
  createdAt: string;
  seenAt: string | null;
};

function headers(accessToken: string) {
  return {
    apikey: OTW_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(row: any): UnderAskDealAlert {
  return {
    id: String(row?.id || ""),
    savedSearchId: String(row?.saved_search_id || ""),
    title: typeof row?.title === "string" ? row.title : "New UnderAsk deal",
    url: typeof row?.url === "string" ? row.url : "",
    source: typeof row?.source === "string" ? row.source : "Web",
    askPrice: numberOrNull(row?.ask_price),
    expectedSalePrice: numberOrNull(row?.expected_sale_price),
    netProfit: numberOrNull(row?.net_profit),
    roiPercent: numberOrNull(row?.roi_percent),
    dealScore: numberOrNull(row?.deal_score) ?? 0,
    reasoning: typeof row?.reasoning === "string" && row.reasoning ? row.reasoning : null,
    createdAt: typeof row?.created_at === "string" ? row.created_at : "",
    seenAt: typeof row?.seen_at === "string" && row.seen_at ? row.seen_at : null,
  };
}

export async function fetchUnderAskDealAlerts(
  accessToken: string,
  limit = 100,
): Promise<UnderAskDealAlert[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const select = [
    "id",
    "saved_search_id",
    "title",
    "url",
    "source",
    "ask_price",
    "expected_sale_price",
    "net_profit",
    "roi_percent",
    "deal_score",
    "reasoning",
    "created_at",
    "seen_at",
  ].join(",");

  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_deal_alerts?select=${select}&order=created_at.desc&limit=${safeLimit}`,
    {
      headers: headers(accessToken),
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load Deal Alerts.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalize) : [];
}

export async function markUnderAskAlertSeen(accessToken: string, id: string) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_deal_alerts?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        ...headers(accessToken),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ seen_at: new Date().toISOString() }),
    },
  );

  if (!response.ok) throw new Error("Could not mark this alert as seen.");
}

export async function deleteUnderAskDealAlert(accessToken: string, id: string) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_deal_alerts?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(accessToken),
    },
  );

  if (!response.ok) throw new Error("Could not delete this alert.");
}
