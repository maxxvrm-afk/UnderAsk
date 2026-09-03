"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
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

  async function search(e: FormEvent) {
    e.preventDefault();

    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    setLoading(true);
    setError("");
    startProgress();

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: cleanQuery }),
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
