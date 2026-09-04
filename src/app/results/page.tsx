"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getValidOwnTheWallSession,
  signOutOwnTheWall,
} from "@/lib/ownTheWallAuth";
import { saveUnderAskSearch } from "@/lib/underAskSavedSearches";

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
    min_roi?: number | null;
    min_score?: number | null;
    preferred_sites?: string[];
    plan?: string;
    usage?: {
      used?: number;
      limit?: number;
      remaining?: number;
    };
  } | null;
  filters?: {
    minRoi?: number | null;
    minScore?: number | null;
    preferredSiteIds?: string[];
    preferredSites?: string[];
  } | null;
  searchedAt?: number;
};

const LABEL_TO_SITE: Record<string, string> = {
  Marktplaats: "marktplaats",
  eBay: "ebay",
  "2dehands": "2dehands",
  Kleinanzeigen: "kleinanzeigen",
  Vinted: "vinted",
  Catawiki: "catawiki",
  "Facebook Marketplace": "facebook",
  AutoScout24: "autoscout24",
};

function searchConfig(result: StoredSearch) {
  const minRoi = result.filters?.minRoi ?? result.meta?.min_roi ?? null;
  const minScore = result.filters?.minScore ?? result.meta?.min_score ?? null;

  const directIds = Array.isArray(result.filters?.preferredSiteIds)
    ? result.filters?.preferredSiteIds || []
    : [];
  const labels = Array.isArray(result.meta?.preferred_sites)
    ? result.meta?.preferred_sites || []
    : Array.isArray(result.filters?.preferredSites)
      ? result.filters?.preferredSites || []
      : [];
  const preferredSites = directIds.length
    ? directIds
    : labels.map((site) => LABEL_TO_SITE[site] || site).filter(Boolean);

  return { minRoi, minScore, preferredSites };
}

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<StoredSearch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

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

  async function saveCurrentSearch() {
    if (!result || saving) return;
    setSaving(true);
    setActionError("");
    setActionMessage("");

    try {
      const session = await getValidOwnTheWallSession();
      if (!session) {
        router.replace("/login?next=/results");
        return;
      }

      const config = searchConfig(result);
      await saveUnderAskSearch(session.access_token, {
        query: result.query,
        preferredSites: config.preferredSites,
        minRoi: config.minRoi,
        minScore: config.minScore,
      });
      setActionMessage("Search saved.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save this search.");
    } finally {
      setSaving(false);
    }
  }

  async function rerunCurrentSearch() {
    if (!result || rerunning) return;
    setRerunning(true);
    setActionError("");
    setActionMessage("");

    try {
      const session = await getValidOwnTheWallSession();
      if (!session) {
        router.replace("/login?next=/results");
        return;
      }

      const config = searchConfig(result);
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          query: result.query,
          minRoi: config.minRoi,
          minScore: config.minScore,
          preferredSites: config.preferredSites,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        signOutOwnTheWall();
        router.replace("/login?next=/results");
        return;
      }

      if (response.status === 402) {
        router.replace("/pricing");
        return;
      }

      if (!response.ok) throw new Error(data.error || "Search failed.");

      const nextResult: StoredSearch = {
        query: result.query,
        deals: Array.isArray(data.deals) ? data.deals : [],
        meta: data.meta || null,
        filters: {
          minRoi: config.minRoi,
          minScore: config.minScore,
          preferredSiteIds: config.preferredSites,
          preferredSites: Array.isArray(data?.meta?.preferred_sites)
            ? data.meta.preferred_sites
            : [],
        },
        searchedAt: Date.now(),
      };

      sessionStorage.setItem("underask:last-search", JSON.stringify(nextResult));
      setResult(nextResult);
      setActionMessage("Fresh listings loaded.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not rerun this search.");
    } finally {
      setRerunning(false);
    }
  }

  if (!loaded) {
    return (
      <main className="shell">
        <nav className="nav">
          <a className="brand" href="/">UnderAsk</a>
          <div className="navLinks">
            <a href="/search">Search</a>
            <a href="/saved">Saved</a>
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
            <a href="/saved">Saved</a>
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
          <a href="/saved">Saved</a>
          <a href="/history">History</a>
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
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="buttonGhost" type="button" disabled={saving || rerunning} onClick={saveCurrentSearch}>
              {saving ? "Saving..." : "Save search"}
            </button>
            <button className="buttonPrimary" type="button" disabled={saving || rerunning} onClick={rerunCurrentSearch}>
              {rerunning ? "Searching..." : "Run again"}
            </button>
          </div>
        </div>
        {actionMessage && <p className="lede small" style={{ marginTop: 12 }}>{actionMessage}</p>}
        {actionError && <p className="error" style={{ marginTop: 12 }}>{actionError}</p>}
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
                <div className="metric"><span>ASK</span><strong>€{deal.ask_price}</strong></div>
                <div className="metric"><span>EXPECTED SALE</span><strong>€{deal.expected_sale_price}</strong></div>
                <div className="metric"><span>NET PROFIT</span><strong className="accent">€{deal.net_profit}</strong></div>
                <div className="metric"><span>ROI</span><strong className="accent">{deal.roi_percent}%</strong></div>
                <div className="metric"><span>QUICK SALE</span><strong>€{deal.quick_sale_price}</strong></div>
                <div className="metric"><span>CONFIDENCE</span><strong>{deal.confidence}%</strong></div>
                <div className="metric"><span>SELL SPEED</span><strong>{deal.speed_to_sell}/100</strong></div>
                <div className="metric"><span>PRICE GAP</span><strong>{deal.price_gap_percent}%</strong></div>
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

              <a className="openLink" href={deal.url} target="_blank" rel="noreferrer">
                Open listing →
              </a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
