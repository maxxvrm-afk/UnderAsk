"use client";

import { FormEvent, useState } from "react";

type Deal = {
  title: string;
  url: string;
  source: string;
  ask_price: number;
  expected_sale_price: number;
  quick_sale_price: number;
  net_profit: number;
  roi_percent: number;
  confidence: number;
  speed_to_sell: number;
  price_gap_percent: number;
  deal_score: number;
  reasoning: string;
  risks?: string[];
  evidence?: string[];
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(e: FormEvent) {
    e.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setDeals([]);

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }

      setDeals(data.deals || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
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

        <p>
          It searches the web, verifies market value, calculates ROI
          and ranks the strongest opportunities.
        </p>

        <form onSubmit={search}>
          <div className="searchBox">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="I have €800. Find deals with at least €200 profit..."
            />

            <button
              className="buttonPrimary"
              disabled={loading}
              type="submit"
            >
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
              onClick={() => setQuery(example)}
            >
              {example}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {deals.length > 0 && (
        <section className="dealGrid">
          {deals.map((deal, index) => (
            <article className="dealCard" key={`${deal.url}-${index}`}>
              <div className="dealTop">
                <div>
                  <span className="source">
                    #{index + 1} · {deal.source}
                  </span>

                  <h2>{deal.title}</h2>
                </div>

                <div className="score">
                  {Math.round(deal.deal_score)}
                  <span>/100</span>
                </div>
              </div>

              <div className="metrics">
                <div>
                  <span>ASK</span>
                  <strong>€{deal.ask_price}</strong>
                </div>

                <div>
                  <span>EXPECTED SALE</span>
                  <strong>€{deal.expected_sale_price}</strong>
                </div>

                <div>
                  <span>NET PROFIT</span>
                  <strong>€{deal.net_profit}</strong>
                </div>

                <div>
                  <span>ROI</span>
                  <strong>{deal.roi_percent}%</strong>
                </div>

                <div>
                  <span>CONFIDENCE</span>
                  <strong>{deal.confidence}%</strong>
                </div>

                <div>
                  <span>SELL SPEED</span>
                  <strong>{deal.speed_to_sell}/100</strong>
                </div>
              </div>

              <p>{deal.reasoning}</p>

              {deal.risks?.[0] && (
                <p>
                  <strong>Risk:</strong> {deal.risks[0]}
                </p>
              )}

              {deal.evidence?.[0] && (
                <p>
                  <strong>Evidence:</strong> {deal.evidence[0]}
                </p>
              )}

              <a
                className="buttonGhost"
                href={deal.url}
                target="_blank"
                rel="noreferrer"
              >
                Open listing →
              </a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}