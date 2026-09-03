"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanId } from "@/lib/searchPlans";
import {
  fetchUnderAskEntitlement,
  getValidOwnTheWallSession,
  type OtwSession,
  type UnderAskEntitlement,
} from "@/lib/ownTheWallAuth";
import {
  cancelUnderAskSubscription,
  changeUnderAskPlan,
  createUnderAskCheckout,
  reactivateUnderAskSubscription,
  subscriptionHasAccess,
  type SubscriptionUpdate,
} from "@/lib/underAskBilling";

const plans: Array<{
  id: PlanId;
  name: string;
  price: string;
  desc: string;
  featured?: boolean;
}> = [
  {
    id: "scout",
    name: "Scout",
    price: "€39",
    desc: "1 required marketplace · AI deal score · ROI filters",
  },
  {
    id: "pro",
    name: "Pro",
    price: "€89",
    desc: "Up to 2 marketplaces · stronger search priority · full AI evidence",
    featured: true,
  },
  {
    id: "multi-pro",
    name: "Multi Pro",
    price: "€149",
    desc: "Up to 3 marketplaces · wider opportunity coverage · arbitrage workflow",
  },
  {
    id: "business",
    name: "Business",
    price: "€249",
    desc: "No marketplace required · broad all-web search · maximum search freedom",
  },
];

function planName(plan: PlanId) {
  return plans.find((item) => item.id === plan)?.name || "UnderAsk";
}

function dateLabel(value: string | null) {
  if (!value) return "the end of your billing period";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "the end of your billing period";
  }
}

export default function Pricing() {
  const router = useRouter();
  const [session, setSession] = useState<OtwSession | null>(null);
  const [entitlement, setEntitlement] = useState<UnderAskEntitlement | null>(null);
  const [checking, setChecking] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [billingAction, setBillingAction] = useState<"cancel" | "reactivate" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const activeSession = await getValidOwnTheWallSession();
        if (!mounted) return;
        setSession(activeSession);

        if (activeSession) {
          const current = await fetchUnderAskEntitlement(activeSession.access_token);
          if (mounted) setEntitlement(current);
        }
      } catch {
        if (mounted) {
          setSession(null);
          setEntitlement(null);
        }
      } finally {
        if (mounted) setChecking(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  function applyUpdate(update: SubscriptionUpdate) {
    setEntitlement({
      plan: update.plan,
      subscription_status: update.subscription_status,
      current_period_end: update.current_period_end,
      cancel_at_period_end: update.cancel_at_period_end,
    });
  }

  async function choosePlan(plan: PlanId) {
    setError("");
    setNotice("");

    if (!session) {
      router.push("/login?next=/pricing");
      return;
    }

    const hasSubscription = Boolean(
      entitlement && subscriptionHasAccess(entitlement.subscription_status),
    );

    if (hasSubscription && entitlement) {
      if (entitlement.plan === plan) {
        router.push("/search");
        return;
      }

      setLoadingPlan(plan);
      try {
        const update = await changeUnderAskPlan(session.access_token, plan);
        applyUpdate(update);
        setNotice(`Your UnderAsk plan is now ${planName(update.plan)}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change plan.");
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setLoadingPlan(plan);
    try {
      const url = await createUnderAskCheckout(session.access_token, plan);
      window.location.assign(url);
    } catch (err) {
      setLoadingPlan(null);
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  async function cancelSubscription() {
    if (!session || !entitlement) return;

    const confirmed = window.confirm(
      `Cancel ${planName(entitlement.plan)} at the end of the current billing period? You keep access until then.`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    setBillingAction("cancel");
    try {
      const update = await cancelUnderAskSubscription(session.access_token);
      applyUpdate(update);
      setNotice(`Cancellation scheduled. Access stays active until ${dateLabel(update.current_period_end)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel subscription.");
    } finally {
      setBillingAction(null);
    }
  }

  async function keepSubscription() {
    if (!session) return;

    setError("");
    setNotice("");
    setBillingAction("reactivate");
    try {
      const update = await reactivateUnderAskSubscription(session.access_token);
      applyUpdate(update);
      setNotice("Your UnderAsk subscription will continue normally.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reactivate subscription.");
    } finally {
      setBillingAction(null);
    }
  }

  const hasSubscription = Boolean(
    entitlement && subscriptionHasAccess(entitlement.subscription_status),
  );
  const busy = Boolean(loadingPlan || billingAction);

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/search">Search</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero pricingHero">
        <div className="eyebrow">LIVE STRIPE SUBSCRIPTIONS</div>
        <h1>Choose your edge.</h1>
        <p className="lede small">
          Your UnderAsk subscription is tied to the same account you use for OWN THE WALL.
          Stripe updates your access automatically after payment.
        </p>

        {!checking && session && entitlement && (
          <>
            <div className="accountLine">
              <span>{session.user.email || "OWN THE WALL user"}</span>
              <span>Current: {planName(entitlement.plan)}</span>
              <span>Status: {entitlement.subscription_status}</span>
            </div>

            {hasSubscription && (
              <div className="subscriptionManager">
                <div>
                  <strong>{planName(entitlement.plan)} subscription</strong>
                  <span>
                    {entitlement.cancel_at_period_end
                      ? `Scheduled to end ${dateLabel(entitlement.current_period_end)}`
                      : `Renews ${dateLabel(entitlement.current_period_end)}`}
                  </span>
                </div>
                {entitlement.cancel_at_period_end ? (
                  <button
                    type="button"
                    className="buttonGhost compactButton"
                    disabled={busy}
                    onClick={keepSubscription}
                  >
                    {billingAction === "reactivate" ? "Updating..." : "Keep subscription"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cancelSubscriptionButton"
                    disabled={busy}
                    onClick={cancelSubscription}
                  >
                    {billingAction === "cancel" ? "Updating..." : "Cancel at period end"}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {notice && <p className="billingNotice">{notice}</p>}
      {error && <p className="error pricingError">{error}</p>}

      <section className="pricingGrid">
        {plans.map((plan) => {
          const current = hasSubscription && entitlement?.plan === plan.id;
          const loading = loadingPlan === plan.id;

          return (
            <article
              className={`priceCard ${plan.featured ? "featured" : ""} ${current ? "currentPlan" : ""}`}
              key={plan.id}
            >
              <div className="source">{plan.name}</div>
              <div className="price">{plan.price}<span>/mo</span></div>
              <p>{plan.desc}</p>
              <button
                type="button"
                className={plan.featured ? "buttonPrimary" : "buttonGhost"}
                disabled={busy || checking}
                onClick={() => choosePlan(plan.id)}
              >
                {checking
                  ? "Checking account..."
                  : loading
                    ? hasSubscription
                      ? "Updating plan..."
                      : "Opening Stripe..."
                    : current
                      ? "Current plan · go to search"
                      : hasSubscription
                        ? `Switch to ${plan.name}`
                        : session
                          ? `Choose ${plan.name}`
                          : "Sign in to subscribe"}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
