"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function SearchPage() {
  const router = useRouter();
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
    setPreferredSites((current) =>
      current.includes(id)
        ? current.filter((site) => site !== id)
        : [...current, id],
    );
  }

  async function search(e: FormEvent) {
    e.preventDefault();

    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    const roiValue = minRoi === "" ? null : Number(minRoi);
    const scoreValue = minScore === "" ? null : Number(minScore);

    setLoading(true);
    setError("");
    startProgress();

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: cleanQuery,
          minRoi: Number.isFinite(roiValue) ? roiValue : null,
          minScore: Number.isFinite(scoreValue) ? scoreValue : null,
          preferredSites,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }

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

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">
          UnderAsk
        </a>

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
                <span>Optional · broad web search always stays on</span>
              </div>
              <div className="filterSummaryRight">
                {activePreferenceCount > 0 && (
                  <span className="filterCount">{activePreferenceCount} active</span>
                )}
                <span className="filterChevron" aria-hidden="true">⌄</span>
              </div>
            </summary>

            <div className="filterBody">
              <div className="filterFields">
                <label className="filterField">
                  <span>MINIMUM ROI</span>
                  <div className="numberInputWrap">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="5"
                      inputMode="numeric"
                      placeholder="Any"
                      value={minRoi}
                      disabled={loading}
                      onChange={(e) => setMinRoi(e.target.value)}
                    />
                    <b>%</b>
                  </div>
                  <small>Only show deals that clear this ROI.</small>
                </label>

                <label className="filterField">
                  <span>MINIMUM AI SCORE</span>
                  <div className="numberInputWrap">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      inputMode="numeric"
                      placeholder="Any"
                      value={minScore}
                      disabled={loading}
                      onChange={(e) => setMinScore(e.target.value)}
                    />
                    <b>/100</b>
                  </div>
                  <small>UnderAsk filters by its final deal score.</small>
                </label>
              </div>

              <div className="sitePreferenceBlock">
                <div className="sitePreferenceHead">
                  <div>
                    <span>PREFERRED SITES</span>
                    <p>Selected sites get priority, but UnderAsk still searches the rest of the web.</p>
                  </div>
                  {preferredSites.length > 0 && (
                    <button
                      type="button"
                      className="clearSites"
                      onClick={() => setPreferredSites([])}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="siteChoices">
                  {SITE_OPTIONS.map((site) => {
                    const selected = preferredSites.includes(site.id);
                    return (
                      <button
                        type="button"
                        key={site.id}
                        className={selected ? "siteChoice selected" : "siteChoice"}
                        aria-pressed={selected}
                        disabled={loading}
                        onClick={() => toggleSite(site.id)}
                      >
                        <span className="siteCheck">{selected ? "✓" : "+"}</span>
                        {site.label}
                      </button>
                    );
                  })}
                </div>

                <div className="broadSearchNote">
                  <strong>Broad search remains active.</strong> No sites selected = search everywhere. Sites selected = search everywhere, with extra priority on those sites.
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
            <button
              key={example}
              type="button"
              disabled={loading}
              onClick={() => setQuery(example)}
            >
              {example}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {loading && (
        <div className="searchOverlay" role="dialog" aria-modal="true">
          <div className="searchModal">
            <div className="searchPulse" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <div className="eyebrow">UNDERASK LIVE SEARCH</div>
            <h2>Finding your best deals.</h2>
            <p>{progressLabel()}</p>

            <div
              className="progressTrack"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="progressFill"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="progressMeta">
              <span>LIVE WEB SEARCH</span>
              <strong>{progress}%</strong>
            </div>

            <div className="searchQueryPreview">“{query.trim()}”</div>
          </div>
        </div>
      )}
    </main>
  );
}
