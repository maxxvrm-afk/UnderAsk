"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SEARCH_PLAN_RULES,
  type PlanId,
} from "@/lib/searchPlans";

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

// Temporary until authenticated subscription status is added.
const ACTIVE_PLAN: PlanId = "business";

export default function SearchPage() {
  const router = useRouter();
  const planRule = SEARCH_PLAN_RULES[ACTIVE_PLAN];
  const [query, setQuery] = useState("");
  const [minRoi, setMinRoi] = useState("");
  const [minScore, setMinScore] = useState("");
  const [preferredSites, setPreferredSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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

  async function search(e: FormEvent) {
    e.preventDefault();

    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    if (preferredSites.length < planRule.minSites) {
      setError(
        `${planRule.name} requires at least ${planRule.minSites} marketplace${planRule.minSites === 1 ? "" : "s"} to be selected.`,
      );
      return;
    }

    const roiValue = minRoi === "" ? null : Number(minRoi);
    const scoreValue = minScore === "" ? null : Number(minScore);

    setLoading(true);
    setError("");
    startProgress();

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: cleanQuery,
          minRoi: Number.isFinite(roiValue) ? roiValue : null,
          minScore: Number.isFinite(scoreValue) ? scoreValue : null,
          preferredSites,
          plan: ACTIVE_PLAN,
        }),
      });

      const data = await response.json();
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
            preferredSites: SITE_OPTIONS.filter((site) =>
              preferredSites.includes(site.id),
            ).map((site) => site.label),
            plan: planRule.name,
          },
          searchedAt: Date.now(),
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 450));
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
        <div className="navLinks">
          <a href="/search">Search</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero">
        <div className="eyebrow">AI DEAL INTELLIGENCE</div>
        <h1>Tell UnderAsk what deal you want.</h1>
        <p className="lede small">
          It searches the web, verifies market value, calculates ROI and ranks
          the strongest opportunities.
        </p>

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
              {loading ? "Searching..." : "Find deals"}
            </button>
          </div>

          <details className="filterMenu">
            <summary>
              <div>
                <strong>Search preferences</strong>
                <span>{planRule.name} plan · set ROI, score and marketplace priority</span>
              </div>
              <div className="filterSummaryRight">
                {activePreferenceCount > 0 && (
                  <span className="filterCount">{activePreferenceCount} active</span>
                )}
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
