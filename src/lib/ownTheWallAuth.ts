import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import type { PlanId } from "@/lib/searchPlans";

const SESSION_KEY = "underask:otw-session";

export type OtwSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

export type UnderAskEntitlement = {
  plan: PlanId;
  subscription_status: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  current_period_end: string | null;
};

function normalizeSession(data: any): OtwSession {
  const expiresIn = Number(data?.expires_in) || 3600;
  return {
    access_token: String(data?.access_token || ""),
    refresh_token: String(data?.refresh_token || ""),
    expires_at: Date.now() + expiresIn * 1000,
    user: {
      id: String(data?.user?.id || ""),
      email: typeof data?.user?.email === "string" ? data.user.email : undefined,
    },
  };
}

export async function signInWithOwnTheWall(email: string, password: string) {
  const response = await fetch(`${OTW_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.msg || data?.error_description || data?.message || "Could not sign in.");
  }

  const session = normalizeSession(data);
  if (!session.access_token || !session.refresh_token || !session.user.id) {
    throw new Error("OWN THE WALL returned an incomplete session.");
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getStoredOwnTheWallSession(): OtwSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as OtwSession;
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getValidOwnTheWallSession(): Promise<OtwSession | null> {
  const stored = getStoredOwnTheWallSession();
  if (!stored) return null;

  if (stored.expires_at > Date.now() + 60_000) return stored;

  const response = await fetch(`${OTW_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: stored.refresh_token }),
  });

  if (!response.ok) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  const data = await response.json();
  const refreshed = normalizeSession(data);
  localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
  return refreshed;
}

export async function fetchUnderAskEntitlement(accessToken: string): Promise<UnderAskEntitlement> {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_entitlements?select=plan,subscription_status,current_period_end&limit=1`,
    {
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load your UnderAsk plan.");
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;

  return {
    plan:
      row?.plan === "pro" || row?.plan === "multi-pro" || row?.plan === "business"
        ? row.plan
        : "scout",
    subscription_status:
      row?.subscription_status === "trialing" ||
      row?.subscription_status === "active" ||
      row?.subscription_status === "past_due" ||
      row?.subscription_status === "canceled"
        ? row.subscription_status
        : "inactive",
    current_period_end: typeof row?.current_period_end === "string" ? row.current_period_end : null,
  };
}

export function signOutOwnTheWall() {
  localStorage.removeItem(SESSION_KEY);
}
