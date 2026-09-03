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
  createUnderAskCheckout,
  subscriptionHasAccess,
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

export default function Pricing() {
  const router = useRouter();
  const [session, setSession] = useState<OtwSession | null>(null);
  const [entitlement, setEntitlement] = useState<UnderAskEntitlement | null>(null);
  const [checking, setChecking] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState("");

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

  async function startCheckout(plan: PlanId) {
    setError("");

    if (!session) {
      router.push("/login?next=/pricing");
      return;
    }

    if (entitlement && subscriptionHasAccess(entitlement.subscription_status)) {
      if (entitlement.plan === plan) {
        router.push("/search");
        return;
      }

      setError(
        `Your ${entitlement.plan} subscription is already active. UnderAsk blocks a second Stripe subscription on the same account.`,
      );
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

  const hasSubscription = Boolean(
    entitlement && subscriptionHasAccess(entitlement.subscription_status),
  );

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
          <div className="accountLine">
            <span>{session.user.email || "OWN THE WALL user"}</span>
            <span>Current: {entitlement.plan}</span>
            <span>Status: {entitlement.subscription_status}</span>
          </div>
        )}
      </section>

      {error && <p className="error pricingError">{error}</p>}

      <section className="pricingGrid">
        {plans.map((plan) => {
          const current = hasSubscription && entitlement?.plan === plan.id;
          const anotherActivePlan = hasSubscription && !current;
          const loading = loadingPlan === plan.id;

          return (
            <article
              className={`priceCard ${plan.featured ? "featured" : ""}`}
              key={plan.id}
            >
              <div className="source">{plan.name}</div>
              <div className="price">{plan.price}<span>/mo</span></div>
              <p>{plan.desc}</p>
              <button
                type="button"
                className={plan.featured ? "buttonPrimary" : "buttonGhost"}
                disabled={Boolean(loadingPlan) || anotherActivePlan || checking}
                onClick={() => startCheckout(plan.id)}
              >
                {checking
                  ? "Checking account..."
                  : loading
                    ? "Opening Stripe..."
                    : current
                      ? "Go to search"
                      : anotherActivePlan
                        ? "Existing subscription"
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
