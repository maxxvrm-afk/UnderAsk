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

export function subscriptionHasAccess(status: string) {
  return status === "active" || status === "trialing" || status === "past_due";
}
