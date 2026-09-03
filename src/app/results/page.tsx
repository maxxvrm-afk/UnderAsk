"use client";

import { useEffect, useState } from "react";

type Deal = {
  title: string;
  url: string;
  source: string;
  ask_price: number;
  expected_sale_price: number;
  quick_sale_price: number;
  estimated_fees?: number;
  estimated_shipping?: number;
  estimated_repair_cost?: number;
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

type StoredSearch = {
  query: string;
  deals: Deal[];
  meta?: {
    model?: string;
    result_count?: number;
  } | null;
  searchedAt?: number;
};

export default function ResultsPage() {
  const [result, setResult] = useState<StoredSearch | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("underask:last-search");
      if (stored) setResult(JSON.parse(stored));
    } catch {
      setResult(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  if (!loaded) {
    return (
      <main className="shell">
        <nav className="nav">
          <a className="brand" href="/">UnderAsk</a>
          <div className="navLinks">
            <a href="/search">Search</a>
            <a href="/pricing">Pricing</a>
          </div>
        </nav>
        <section className="resultsHero">
          <div className="eyebrow">LOADING RESULTS</div>
          <h1>Your deals are ready.</h1>
        </section>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="shell">
        <nav className="nav">
          <a className="brand" href="/">UnderAsk</a>
          <div className="navLinks">
            <a href="/search">Search</a>
            <a href="/pricing">Pricing</a>
          </div>
        </nav>

        <section className="resultsHero emptyResults">
          <div className="eyebrow">NO ACTIVE SEARCH</div>
          <h1>Start with a search.</h1>
          <p className="lede small">
            UnderAsk needs a fresh search before it can show ranked deals here.
          </p>
          <a className="buttonPrimary" href="/search">Find deals</a>
        </section>
      </main>
    );
  }

  const deals = Array.isArray(result.deals) ? result.deals : [];

  return (
    <main className="shell resultsShell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/search">New search</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="resultsHero">
        <div className="eyebrow">UNDERASK RESULTS</div>
        <div className="resultsHeadingRow">
          <div>
            <h1>{deals.length ? `${deals.length} deals found.` : "No strong deals found."}</h1>
            <p className="lede small resultsQuery">“{result.query}”</p>
          </div>
          <a className="buttonGhost" href="/search">Search again</a>
        </div>
      </section>

      {deals.length === 0 ? (
        <section className="noDealsCard">
          <span className="source">SEARCH COMPLETE</span>
          <h2>No deal passed UnderAsk&apos;s profit filter.</h2>
          <p>
            Try increasing your budget, widening the location, or searching for
            a broader product category.
          </p>
          <a className="buttonPrimary" href="/search">Adjust search</a>
        </section>
      ) : (
        <section className="results">
          {deals.map((deal, index) => (
            <article className="dealCard" key={`${deal.url}-${index}`}>
              <div className="dealTop">
                <div>
                  <span className="source">#{index + 1} · {deal.source}</span>
                  <h2>{deal.title}</h2>
                </div>

                <div className="score">
                  <strong>{Math.round(deal.deal_score)}</strong>
                  <span>/100</span>
                </div>
              </div>

              <div className="metrics">
                <div className="metric">
                  <span>ASK</span>
                  <strong>€{deal.ask_price}</strong>
                </div>
                <div className="metric">
                  <span>EXPECTED SALE</span>
                  <strong>€{deal.expected_sale_price}</strong>
                </div>
                <div className="metric">
                  <span>NET PROFIT</span>
                  <strong className="accent">€{deal.net_profit}</strong>
                </div>
                <div className="metric">
                  <span>ROI</span>
                  <strong className="accent">{deal.roi_percent}%</strong>
                </div>
                <div className="metric">
                  <span>QUICK SALE</span>
                  <strong>€{deal.quick_sale_price}</strong>
                </div>
                <div className="metric">
                  <span>CONFIDENCE</span>
                  <strong>{deal.confidence}%</strong>
                </div>
                <div className="metric">
                  <span>SELL SPEED</span>
                  <strong>{deal.speed_to_sell}/100</strong>
                </div>
                <div className="metric">
                  <span>PRICE GAP</span>
                  <strong>{deal.price_gap_percent}%</strong>
                </div>
              </div>

              <p className="reasoning">{deal.reasoning}</p>

              <div className="detailGrid">
                <div>
                  <span className="detailLabel">MAIN RISK</span>
                  <p>{deal.risks?.[0] || "No major risk flagged."}</p>
                </div>
                <div>
                  <span className="detailLabel">MARKET EVIDENCE</span>
                  <p>{deal.evidence?.[0] || "Based on current public market evidence."}</p>
                </div>
              </div>

              <a
                className="openLink"
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
