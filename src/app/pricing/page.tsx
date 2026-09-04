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
  type BillingInterval,
  type SubscriptionUpdate,
} from "@/lib/underAskBilling";

const plans: Array<{
  id: PlanId;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  desc: string;
  featured?: boolean;
}> = [
  {
    id: "scout",
    name: "Scout",
    monthlyPrice: "€29.99",
    annualPrice: "€299",
    desc: "100 searches · 1 marketplace · 1 Deal Alert after trial",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: "€59.99",
    annualPrice: "€599",
    desc: "300 searches · up to 2 marketplaces · 3 Deal Alerts after trial",
    featured: true,
  },
  {
    id: "multi-pro",
    name: "Multi Pro",
    monthlyPrice: "€119.99",
    annualPrice: "€1,199",
    desc: "750 searches · up to 3 marketplaces · 5 Deal Alerts after trial",
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: "€249.99",
    annualPrice: "€2,499",
    desc: "1,500 searches · broad all-web search · 10 Deal Alerts after trial",
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

function intervalName(interval: BillingInterval) {
  return interval === "year" ? "yearly" : "monthly";
}

export default function Pricing() {
  const router = useRouter();
  const [session, setSession] = useState<OtwSession | null>(null);
  const [entitlement, setEntitlement] = useState<UnderAskEntitlement | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
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
          if (mounted) {
            setEntitlement(current);
            if (subscriptionHasAccess(current.subscription_status)) {
              setBillingInterval(current.billing_interval);
            }
          }
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
    setEntitlement((current) => ({
      plan: update.plan,
      billing_interval: update.billing_interval,
      subscription_status: update.subscription_status,
      current_period_end: update.current_period_end,
      trial_used_at: current?.trial_used_at || null,
      trial_end: update.trial_end,
      cancel_at_period_end: update.cancel_at_period_end,
    }));
    setBillingInterval(update.billing_interval);
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
      if (
        entitlement.plan === plan &&
        entitlement.billing_interval === billingInterval
      ) {
        router.push("/search");
        return;
      }

      setLoadingPlan(plan);
      try {
        const update = await changeUnderAskPlan(
          session.access_token,
          plan,
          billingInterval,
        );
        applyUpdate(update);
        setNotice(
          `Your UnderAsk subscription is now ${planName(update.plan)} · ${intervalName(update.billing_interval)}.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change plan.");
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setLoadingPlan(plan);
    try {
      const url = await createUnderAskCheckout(
        session.access_token,
        plan,
        billingInterval,
      );
      window.location.assign(url);
    } catch (err) {
      setLoadingPlan(null);
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  async function cancelSubscription() {
    if (!session || !entitlement) return;

    const confirmed = window.confirm(
      entitlement.subscription_status === "trialing"
        ? "Cancel your UnderAsk trial before it becomes paid?"
        : `Cancel ${planName(entitlement.plan)} at the end of the current billing period? You keep access until then.`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    setBillingAction("cancel");
    try {
      const update = await cancelUnderAskSubscription(session.access_token);
      applyUpdate(update);
      setNotice(
        entitlement.subscription_status === "trialing"
          ? `Cancellation scheduled. Your trial stays available until ${dateLabel(update.current_period_end || update.trial_end)}.`
          : `Cancellation scheduled. Access stays active until ${dateLabel(update.current_period_end)}.`,
      );
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
  const trialEligible = !entitlement?.trial_used_at && !hasSubscription;
  const isTrialing = entitlement?.subscription_status === "trialing";
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
        <div className="eyebrow">7-DAY FREE TRIAL · 10 SEARCHES</div>
        <h1>Choose your edge.</h1>
        <p className="lede small">
          New accounts get one 7-day free trial with up to 10 live searches.
          A payment method is required; cancel before the trial ends and you will not be charged.
        </p>

        <div
          role="group"
          aria-label="Billing interval"
          style={{
            display: "inline-flex",
            gap: 6,
            padding: 5,
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 999,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className={billingInterval === "month" ? "buttonPrimary compactButton" : "buttonGhost compactButton"}
            disabled={busy}
            onClick={() => setBillingInterval("month")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={billingInterval === "year" ? "buttonPrimary compactButton" : "buttonGhost compactButton"}
            disabled={busy}
            onClick={() => setBillingInterval("year")}
          >
            Yearly · 2 months free
          </button>
        </div>

        {!checking && session && entitlement && (
          <>
            <div className="accountLine">
              <span>{session.user.email || "OWN THE WALL user"}</span>
              <span>Current: {planName(entitlement.plan)}</span>
              <span>Status: {entitlement.subscription_status}</span>
              {hasSubscription && <span>Billing: {intervalName(entitlement.billing_interval)}</span>}
            </div>

            {hasSubscription && (
              <div className="subscriptionManager">
                <div>
                  <strong>
                    {isTrialing
                      ? `${planName(entitlement.plan)} free trial`
                      : `${planName(entitlement.plan)} subscription`}
                  </strong>
                  <span>
                    {isTrialing
                      ? `Trial ends ${dateLabel(entitlement.trial_end || entitlement.current_period_end)} · max 10 searches`
                      : entitlement.cancel_at_period_end
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
                    {billingAction === "cancel"
                      ? "Updating..."
                      : isTrialing
                        ? "Cancel trial"
                        : "Cancel at period end"}
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
          const current = Boolean(
            hasSubscription &&
            entitlement?.plan === plan.id &&
            entitlement?.billing_interval === billingInterval,
          );
          const loading = loadingPlan === plan.id;
          const price = billingInterval === "year" ? plan.annualPrice : plan.monthlyPrice;

          return (
            <article
              className={`priceCard ${plan.featured ? "featured" : ""} ${current ? "currentPlan" : ""}`}
              key={plan.id}
            >
              <div className="source">
                {plan.name}{plan.featured ? " · MOST POPULAR" : ""}
              </div>
              <div className="price">
                {price}<span>/{billingInterval === "year" ? "yr" : "mo"}</span>
              </div>
              {billingInterval === "year" && (
                <p style={{ marginTop: -6, opacity: .7, fontSize: 12 }}>About 2 months free vs monthly</p>
              )}
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
                      ? "Updating subscription..."
                      : "Opening Stripe..."
                    : current
                      ? "Current plan · go to search"
                      : hasSubscription
                        ? `Switch to ${plan.name}`
                        : session
                          ? trialEligible
                            ? `Start 7-day free trial`
                            : `Subscribe to ${plan.name}`
                          : "Sign in to start free trial"}
              </button>
            </article>
          );
        })}
      </section>

      <p className="lede small" style={{ textAlign: "center", margin: "24px auto 0", maxWidth: 760 }}>
        Free trial is available once per account. Trial includes up to 10 manual searches; Deal Alerts unlock after the paid subscription starts.
      </p>
    </main>
  );
}
