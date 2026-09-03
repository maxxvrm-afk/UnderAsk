import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import type { PlanId } from "@/lib/searchPlans";

export async function createUnderAskCheckout(
  accessToken: string,
  plan: PlanId,
) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/functions/v1/underask-create-checkout`,
    {
      method: "POST",
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || "Could not start Stripe checkout.") as Error & {
      code?: string;
      status?: number;
    };
    error.code = typeof data?.code === "string" ? data.code : undefined;
    error.status = response.status;
    throw error;
  }

  if (typeof data?.url !== "string" || !data.url.startsWith("https://")) {
    throw new Error("Stripe checkout did not return a valid URL.");
  }

  return data.url as string;
}

type SubscriptionStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type SubscriptionUpdate = {
  plan: PlanId;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

function normalizeStatus(value: unknown): SubscriptionStatus {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  ) {
    return value;
  }
  return "inactive";
}

async function manageSubscription(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<SubscriptionUpdate> {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/functions/v1/underask-manage-subscription`,
    {
      method: "POST",
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Could not update your subscription.");
  }

  return {
    plan:
      data?.plan === "pro" ||
      data?.plan === "multi-pro" ||
      data?.plan === "business"
        ? data.plan
        : "scout",
    subscription_status: normalizeStatus(data?.subscription_status),
    current_period_end:
      typeof data?.current_period_end === "string"
        ? data.current_period_end
        : null,
    cancel_at_period_end: Boolean(data?.cancel_at_period_end),
  };
}

export function changeUnderAskPlan(
  accessToken: string,
  plan: PlanId,
) {
  return manageSubscription(accessToken, { action: "change_plan", plan });
}

export function cancelUnderAskSubscription(accessToken: string) {
  return manageSubscription(accessToken, { action: "cancel" });
}

export function reactivateUnderAskSubscription(accessToken: string) {
  return manageSubscription(accessToken, { action: "reactivate" });
}

export function subscriptionHasAccess(status: string) {
  return status === "active" || status === "trialing" || status === "past_due";
}
