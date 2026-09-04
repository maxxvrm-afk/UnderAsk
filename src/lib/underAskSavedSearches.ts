import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

export type UnderAskSavedSearch = {
  id: string;
  name: string | null;
  query: string;
  preferredSites: string[];
  minRoi: number | null;
  minScore: number | null;
  alertsEnabled: boolean;
  alertMinScore: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastAlertAt: string | null;
  alertLastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveUnderAskSearchInput = {
  name?: string | null;
  query: string;
  preferredSites?: string[];
  minRoi?: number | null;
  minScore?: number | null;
};

export type UnderAskAlertState = {
  enabled: boolean;
  plan: string;
  maxActive: number;
  activeCount: number;
  frequencyHours: number;
  alertMinScore: number;
  nextCheckAt: string | null;
};

function headers(accessToken: string) {
  return {
    apikey: OTW_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function normalize(row: any): UnderAskSavedSearch {
  return {
    id: String(row?.id || ""),
    name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : null,
    query: typeof row?.query === "string" ? row.query : "",
    preferredSites: Array.isArray(row?.preferred_sites)
      ? row.preferred_sites.filter((site: unknown): site is string => typeof site === "string")
      : [],
    minRoi: optionalNumber(row?.min_roi),
    minScore: optionalNumber(row?.min_score),
    alertsEnabled: Boolean(row?.alerts_enabled),
    alertMinScore: optionalNumber(row?.alert_min_score) ?? 70,
    nextCheckAt: optionalString(row?.next_check_at),
    lastCheckedAt: optionalString(row?.last_checked_at),
    lastAlertAt: optionalString(row?.last_alert_at),
    alertLastError: optionalString(row?.alert_last_error),
    createdAt: typeof row?.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : "",
  };
}

export async function fetchUnderAskSavedSearches(
  accessToken: string,
): Promise<UnderAskSavedSearch[]> {
  const select = [
    "id",
    "name",
    "query",
    "preferred_sites",
    "min_roi",
    "min_score",
    "alerts_enabled",
    "alert_min_score",
    "next_check_at",
    "last_checked_at",
    "last_alert_at",
    "alert_last_error",
    "created_at",
    "updated_at",
  ].join(",");

  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_saved_searches?select=${select}&order=created_at.desc`,
    {
      headers: headers(accessToken),
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load saved searches.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalize) : [];
}

export async function saveUnderAskSearch(
  accessToken: string,
  input: SaveUnderAskSearchInput,
): Promise<UnderAskSavedSearch> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/underask_saved_searches`, {
    method: "POST",
    headers: {
      ...headers(accessToken),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: input.name?.trim() || null,
      query: input.query.trim(),
      preferred_sites: Array.isArray(input.preferredSites) ? input.preferredSites : [],
      min_roi: input.minRoi ?? null,
      min_score: input.minScore ?? null,
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || "Could not save this search.");
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("Saved search response was incomplete.");
  return normalize(row);
}

export async function setUnderAskSavedSearchAlert(
  accessToken: string,
  id: string,
  enabled: boolean,
): Promise<UnderAskAlertState> {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/rpc/underask_set_saved_search_alert`,
    {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        p_saved_search_id: id,
        p_enabled: enabled,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = typeof detail?.message === "string" ? detail.message : "Could not update this deal alert.";
    if (message.includes("alert_limit_reached")) {
      throw new Error("You've reached the active Deal Alert limit for your plan.");
    }
    if (message.includes("subscription_required")) {
      throw new Error("An active UnderAsk subscription is required for Deal Alerts.");
    }
    throw new Error("Could not update this Deal Alert.");
  }

  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Deal Alert response was incomplete.");

  return {
    enabled: Boolean(row.enabled),
    plan: typeof row.plan === "string" ? row.plan : "scout",
    maxActive: Number(row.max_active) || 1,
    activeCount: Number(row.active_count) || 0,
    frequencyHours: Number(row.frequency_hours) || 24,
    alertMinScore: optionalNumber(row.alert_min_score) ?? 70,
    nextCheckAt: optionalString(row.next_check_at),
  };
}

export async function deleteUnderAskSavedSearch(accessToken: string, id: string) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_saved_searches?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(accessToken),
    },
  );

  if (!response.ok) throw new Error("Could not delete this saved search.");
}
