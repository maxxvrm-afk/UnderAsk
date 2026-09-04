"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_PLAN_RULES, type PlanId } from "@/lib/searchPlans";
import {
  fetchUnderAskEntitlement,
  getValidOwnTheWallSession,
  signOutOwnTheWall,
} from "@/lib/ownTheWallAuth";
import { subscriptionHasAccess } from "@/lib/underAskBilling";
import { fetchUnderAskPreferences } from "@/lib/underAskPreferences";
import { getSearchGuidance } from "@/lib/searchGuidance";

const SITE_OPTIONS = [
  { id: "marktplaats", label: "Marktplaats" },
  { id: "ebay", label: "eBay" },
  { id: "2dehands", label: "2dehands" },
  { id: "kleinanzeigen", label: "Kleinanzeigen" },
  { id: "vinted", label: "Vinted" },
  { id: "catawiki", label: "Catawiki" },
  { id: "facebook", label: "Facebook Marketplace" },
  { id: "autoscout24", label: "AutoScout24" },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SearchPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanId>("scout");
  const [subscriptionStatus, setSubscriptionStatus] = useState("inactive");
  const [accountReady, setAccountReady] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [billingReturned, setBillingReturned] = useState(false);
  const [query, setQuery] = useState("");
  const [minRoi, setMinRoi] = useState("");
  const [minScore, setMinScore] = useState("");
  const [preferredSites, setPreferredSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const planRule = SEARCH_PLAN_RULES[plan];
  const hasAccess = subscriptionHasAccess(subscriptionStatus);
  const searchGuidance = getSearchGuidance({ query, minRoi, minScore });
  const hasDangerousFilters = searchGuidance.some((item) => item.severity === "danger");

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/search");
          return;
        }

        const cameBackFromBilling =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("billing") === "success";

        let entitlement = await fetchUnderAskEntitlement(session.access_token);

        if (cameBackFromBilling && !subscriptionHasAccess(entitlement.subscription_status)) {
          if (mounted) setBillingReturned(true);
          for (let attempt = 0; attempt < 10; attempt++) {
            await wait(800);
            entitlement = await fetchUnderAskEntitlement(session.access_token);
            if (subscriptionHasAccess(entitlement.subscription_status)) break;
          }
        }

        const preferences = await fetchUnderAskPreferences(session.access_token).catch(() => null);
        if (!mounted) return;

        setPlan(entitlement.plan);
        setSubscriptionStatus(entitlement.subscription_status);
        setAccessToken(session.access_token);
        setAccountEmail(session.user.email || "OWN THE WALL user");

        if (preferences?.completed_at) {
          if (preferences.resell_focus) setQuery(preferences.resell_focus);
          if (preferences.default_min_roi !== null) setMinRoi(String(preferences.default_min_roi));
          if (preferences.default_min_score !== null) setMinScore(String(preferences.default_min_score));
          if (preferences.primary_marketplace) setPreferredSites([preferences.primary_marketplace]);
        }

        setAccountReady(true);

        if (cameBackFromBilling && typeof window !== "undefined") {
          window.history.replaceState({}, "", "/search");
        }
      } catch {
        if (!mounted) return;
        signOutOwnTheWall();
        router.replace("/login?next=/search");
      }
    }

    loadAccount();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [router]);

  function startProgress() {
    setProgress(4);
    timerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 91) return current;
        const step = current < 30 ? 4 : current < 65 ? 2 : 1;
        return Math.min(91, current + step);
      });
    }, 650);
  }

  function stopProgress() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function toggleSite(id: string) {
    setPreferredSites((current) => {
      if (current.includes(id)) return current.filter((site) => site !== id);
      if (planRule.maxSites !== null && current.length >= planRule.maxSites) {
        return current;
      }
      return [...current, id];
    });
  }

  function logout() {
    signOutOwnTheWall();
    router.replace("/login");
  }

  async function search(e: FormEvent) {
    e.preventDefault();

    const cleanQuery = query.trim();
    if (!cleanQuery || loading || !accessToken || !hasAccess) return;

    if (preferredSites.length < planRule.minSites) {
      setError(
        `${planRule.name} requires at least ${planRule.minSites} marketplace${planRule.minSites === 1 ? "" : "s"} to be selected.`,
      );
      return;
    }

    const roiValue = minRoi === "" ? null : Number(minRoi);
    const scoreValue = minScore === "" ? null : Number(minScore);

    if (roiValue !== null && (!Number.isFinite(roiValue) || roiValue < 0 || roiValue > 1000)) {
      setError("ROI must be between 0% and 1000%.");
      return;
    }
    if (scoreValue !== null && (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100)) {
      setError("AI score must be between 0 and 100.");
      return;
    }

    setLoading(true);
    setError("");
    startProgress();

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: cleanQuery,
          minRoi: roiValue,
          minScore: scoreValue,
          preferredSites,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        signOutOwnTheWall();
        router.replace("/login?next=/search");
        return;
      }

      if (response.status === 402) {
        router.replace("/pricing");
        return;
      }

      if (!response.ok) throw new Error(data.error || "Search failed.");

      stopProgress();
      setProgress(100);

      sessionStorage.setItem(
        "underask:last-search",
        JSON.stringify({
          query: cleanQuery,
          deals: Array.isArray(data.deals) ? data.deals : [],
          meta: data.meta || null,
          filters: {
            minRoi: roiValue,
            minScore: scoreValue,
            preferredSiteIds: preferredSites,
            preferredSites: SITE_OPTIONS.filter((site) =>
              preferredSites.includes(site.id),
            ).map((site) => site.label),
            plan: data?.meta?.plan || planRule.name,
          },
          searchedAt: Date.now(),
        }),
      );

      await wait(450);
      router.push("/results");
    } catch (err) {
      stopProgress();
      setLoading(false);
      setProgress(0);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function progressLabel() {
    if (progress < 25) return "Searching live listings...";
    if (progress < 50) return "Checking asking prices...";
    if (progress < 72) return "Comparing market value...";
    if (progress < 92) return "Calculating resale potential...";
    if (progress < 100) return "Ranking the strongest deals...";
    return "Deals ready.";
  }

  if (!accountReady) {
    return (
      <main className="shell">
        <nav className="nav"><a className="brand" href="/">UnderAsk</a></nav>
        <section className="searchHero">
          <div className="eyebrow">OWN THE WALL ACCOUNT</div>
          <h1>{billingReturned ? "Activating your plan." : "Loading your access."}</h1>
          {billingReturned && (
            <p className="lede small">Stripe has returned you to UnderAsk. Waiting for the secure subscription webhook.</p>
          )}
        </section>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="shell">
        <nav className="nav">
          <a className="brand" href="/">UnderAsk</a>
          <div className="navLinks accountNav">
            <a href="/onboarding?next=/pricing">Preferences</a>
            <a href="/pricing">Pricing</a>
            <button type="button" className="navButton" onClick={logout}>Sign out</button>
          </div>
        </nav>

        <section className="searchHero subscriptionGate">
          <div className="eyebrow">SUBSCRIPTION REQUIRED</div>
          <h1>Activate UnderAsk search.</h1>
          <p className="lede small">
            Your OWN THE WALL account is connected, but it does not currently have an active UnderAsk subscription.
          </p>
          <div className="accountLine">
            <span>{accountEmail}</span>
            <span>Plan: {planRule.name}</span>
            <span>Status: {subscriptionStatus}</span>
          </div>
          <div className="subscriptionGateCard">
            <strong>{billingReturned ? "Payment is still being confirmed." : "Choose the search access you need."}</strong>
            <p>
              New accounts can start with a 7-day trial and up to 10 live searches. Scout is €29.99/month; Business unlocks broad web search without a required marketplace selection.
            </p>
            <a className="buttonPrimary" href="/pricing">View plans</a>
          </div>
        </section>
      </main>
    );
  }

  const activePreferenceCount =
    (minRoi !== "" ? 1 : 0) +
    (minScore !== "" ? 1 : 0) +
    preferredSites.length;

  const siteRuleText = planRule.broadWithoutSelection
    ? "No marketplace selection required. UnderAsk searches the broad public web by default."
    : planRule.maxSites === 1
      ? "Your plan requires exactly 1 preferred marketplace. UnderAsk can still use broader web evidence."
      : `Your plan requires at least 1 marketplace and allows up to ${planRule.maxSites}. UnderAsk can still use broader web evidence.`;

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks accountNav">
          <a href="/onboarding?next=/search">Preferences</a>
          <a href="/pricing">Pricing</a>
          <span className="planBadge">{planRule.name}</span>
          <button type="button" className="navButton" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <section className="searchHero">
        <div className="eyebrow">AI DEAL INTELLIGENCE · {planRule.name.toUpperCase()}</div>
        <h1>Tell UnderAsk what deal you want.</h1>
        <p className="lede small">
          It searches the web, verifies market value, calculates ROI and ranks the strongest opportunities.
        </p>
        <div className="accountLine">
          <span>{accountEmail}</span>
          <span>Identity: OWN THE WALL</span>
          <span>Status: {subscriptionStatus}</span>
        </div>

        <form onSubmit={search}>
          <div className="searchBox">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="I have €800. Find deals with at least €200 profit..."
              disabled={loading}
              autoFocus
            />
            <button className="buttonPrimary" disabled={loading} type="submit">
              {loading ? "Searching..." : hasDangerousFilters ? "Search anyway" : "Find deals"}
            </button>
          </div>

          <details className="filterMenu">
            <summary>
              <div>
                <strong>Search preferences</strong>
                <span>{planRule.name} plan · set ROI, score and marketplace priority</span>
              </div>
              <div className="filterSummaryRight">
                {activePreferenceCount > 0 && <span className="filterCount">{activePreferenceCount} active</span>}
                <span className="filterChevron" aria-hidden="true">⌄</span>
              </div>
            </summary>

            <div className="filterBody">
              <div className="planRuleBanner">
                <span>{planRule.name.toUpperCase()}</span>
                <p>{siteRuleText}</p>
              </div>

              <div className="filterFields">
                <label className="filterField">
                  <span>MINIMUM ROI</span>
                  <div className="numberInputWrap">
                    <input type="number" min="0" max="1000" step="5" inputMode="numeric" placeholder="Any" value={minRoi} disabled={loading} onChange={(e) => setMinRoi(e.target.value)} />
                    <b>%</b>
                  </div>
                  <small>Only show deals that clear this ROI.</small>
                </label>

                <label className="filterField">
                  <span>MINIMUM AI SCORE</span>
                  <div className="numberInputWrap">
                    <input type="number" min="0" max="100" step="5" inputMode="numeric" placeholder="Any" value={minScore} disabled={loading} onChange={(e) => setMinScore(e.target.value)} />
                    <b>/100</b>
                  </div>
                  <small>UnderAsk filters by its final deal score.</small>
                </label>
              </div>

              <div className="sitePreferenceBlock">
                <div className="sitePreferenceHead">
                  <div>
                    <span>MARKETPLACE PRIORITY</span>
                    <p>
                      {planRule.maxSites === null
                        ? "Optional on Business. Leave empty for a fully broad search, or select sites to give them extra priority."
                        : `Select ${planRule.minSites === planRule.maxSites ? planRule.minSites : `${planRule.minSites}–${planRule.maxSites}`} marketplace${planRule.maxSites === 1 ? "" : "s"}.`}
                    </p>
                  </div>
                  {preferredSites.length > 0 && planRule.minSites === 0 && (
                    <button type="button" className="clearSites" onClick={() => setPreferredSites([])}>Clear</button>
                  )}
                </div>

                <div className="siteChoices">
                  {SITE_OPTIONS.map((site) => {
                    const selected = preferredSites.includes(site.id);
                    const atLimit =
                      !selected &&
                      planRule.maxSites !== null &&
                      preferredSites.length >= planRule.maxSites;

                    return (
                      <button
                        type="button"
                        key={site.id}
                        className={selected ? "siteChoice selected" : "siteChoice"}
                        aria-pressed={selected}
                        disabled={loading || atLimit}
                        onClick={() => toggleSite(site.id)}
                      >
                        <span className="siteCheck">{selected ? "✓" : "+"}</span>
                        {site.label}
                      </button>
                    );
                  })}
                </div>

                <div className="broadSearchNote">
                  <strong>UnderAsk is never blind to the rest of the web.</strong>{" "}
                  Selected marketplaces control plan priority; public market evidence and comparable listings may still come from elsewhere. Business can leave everything unselected for the broadest search.
                </div>
              </div>
            </div>
          </details>

          {searchGuidance.length > 0 && (
            <div style={{ display: "grid", gap: 9, marginTop: 14, textAlign: "left" }}>
              {searchGuidance.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  style={{
                    padding: "13px 15px",
                    borderRadius: 14,
                    border: item.severity === "danger"
                      ? "1px solid rgba(255,90,90,.46)"
                      : item.severity === "warning"
                        ? "1px solid rgba(255,190,70,.38)"
                        : "1px solid rgba(255,255,255,.12)",
                    background: item.severity === "danger" ? "rgba(255,80,80,.055)" : "rgba(255,255,255,.03)",
                  }}
                >
                  <strong style={{ display: "block" }}>{item.title}</strong>
                  <span style={{ display: "block", marginTop: 4, opacity: .72, lineHeight: 1.45 }}>{item.message}</span>
                </div>
              ))}
              {hasDangerousFilters && (
                <div style={{ fontSize: 13, opacity: .66 }}>
                  Search anyway is allowed. Once the live search starts, it uses 1 search even if zero listings pass these filters.
                </div>
              )}
            </div>
          )}
        </form>

        <div className="chips">
          {[
            "Find camera flips in the Netherlands with 20%+ ROI",
            "Find cheap Polo 9N3 GTI parts in Europe",
            "I have €500. Find the best things to flip",
          ].map((example) => (
            <button key={example} type="button" disabled={loading} onClick={() => setQuery(example)}>{example}</button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {loading && (
        <div className="searchOverlay" role="dialog" aria-modal="true">
          <div className="searchModal">
            <div className="searchPulse" aria-hidden="true"><span /><span /><span /></div>
            <div className="eyebrow">UNDERASK LIVE SEARCH</div>
            <h2>Finding your best deals.</h2>
            <p>{progressLabel()}</p>
            <div className="progressTrack" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="progressFill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progressMeta"><span>LIVE WEB SEARCH</span><strong>{progress}%</strong></div>
            <div className="searchQueryPreview">“{query.trim()}”</div>
          </div>
        </div>
      )}
    </main>
  );
}
