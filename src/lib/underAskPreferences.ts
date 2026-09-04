import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

export type UnderAskPreferences = {
  resell_focus: string;
  default_min_roi: number | null;
  default_min_score: number | null;
  primary_marketplace: string | null;
  completed_at: string | null;
};

export async function fetchUnderAskPreferences(accessToken: string): Promise<UnderAskPreferences | null> {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_onboarding_preferences?select=resell_focus,default_min_roi,default_min_score,primary_marketplace,completed_at&limit=1`,
    {
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load your search preferences.");
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  return {
    resell_focus: typeof row.resell_focus === "string" ? row.resell_focus : "",
    default_min_roi: Number.isFinite(Number(row.default_min_roi)) ? Number(row.default_min_roi) : null,
    default_min_score: Number.isFinite(Number(row.default_min_score)) ? Number(row.default_min_score) : null,
    primary_marketplace: typeof row.primary_marketplace === "string" ? row.primary_marketplace : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export async function saveUnderAskPreferences(
  accessToken: string,
  userId: string,
  preferences: {
    resellFocus: string;
    defaultMinRoi: number | null;
    defaultMinScore: number | null;
    primaryMarketplace: string | null;
  },
) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_onboarding_preferences?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        resell_focus: preferences.resellFocus.trim().slice(0, 500),
        default_min_roi: preferences.defaultMinRoi,
        default_min_score: preferences.defaultMinScore,
        primary_marketplace: preferences.primaryMarketplace,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || "Could not save your search preferences.");
  }
}
