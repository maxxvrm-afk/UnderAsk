import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import type { PlanId } from "@/lib/searchPlans";

export type UnderAskBetaUser = {
  userId: string;
  email: string;
  plan: PlanId;
  enabled: boolean;
  allowAlerts: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  billingPlan: string;
  billingStatus: string;
  used: number;
  limit: number;
  remaining: number;
};

type RpcError = Error & { code?: string };

async function rpc(accessToken: string, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const raw = String(data?.message || data?.hint || data?.details || text || "Beta admin request failed.");
    const error = new Error(raw) as RpcError;
    if (raw.includes("not_authorized")) error.code = "OWNER_ACCESS_REQUIRED";
    else if (raw.includes("user_not_found")) error.code = "USER_NOT_FOUND";
    else if (raw.includes("invalid_email")) error.code = "INVALID_EMAIL";
    else if (raw.includes("invalid_plan")) error.code = "INVALID_PLAN";
    else if (raw.includes("expiry_must_be_future")) error.code = "INVALID_EXPIRY";
    throw error;
  }

  return data;
}

function normalizePlan(value: unknown): PlanId {
  return value === "pro" || value === "multi-pro" || value === "business" ? value : "scout";
}

function mapUser(row: any): UnderAskBetaUser {
  return {
    userId: String(row?.user_id || ""),
    email: String(row?.email || ""),
    plan: normalizePlan(row?.plan),
    enabled: Boolean(row?.enabled),
    allowAlerts: Boolean(row?.allow_alerts),
    expiresAt: typeof row?.expires_at === "string" ? row.expires_at : null,
    note: typeof row?.note === "string" ? row.note : null,
    createdAt: String(row?.created_at || ""),
    updatedAt: String(row?.updated_at || ""),
    billingPlan: String(row?.billing_plan || "scout"),
    billingStatus: String(row?.billing_status || "inactive"),
    used: Number(row?.used) || 0,
    limit: Number(row?.search_limit) || 0,
    remaining: Number(row?.remaining) || 0,
  };
}

export async function fetchUnderAskBetaUsers(accessToken: string) {
  const data = await rpc(accessToken, "underask_owner_beta_users", {});
  return (Array.isArray(data) ? data : []).map(mapUser);
}

export async function grantUnderAskBeta(
  accessToken: string,
  input: {
    email: string;
    plan: PlanId;
    expiresAt?: string | null;
    allowAlerts: boolean;
    note?: string | null;
  },
) {
  return rpc(accessToken, "underask_owner_grant_beta", {
    p_email: input.email,
    p_plan: input.plan,
    p_expires_at: input.expiresAt || null,
    p_allow_alerts: input.allowAlerts,
    p_note: input.note || null,
  });
}

export async function revokeUnderAskBeta(accessToken: string, userId: string) {
  return rpc(accessToken, "underask_owner_revoke_beta", { p_user_id: userId });
}
