"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getValidOwnTheWallSession,
  signOutOwnTheWall,
} from "@/lib/ownTheWallAuth";
import { saveUnderAskSearch } from "@/lib/underAskSavedSearches";
import { getNoResultsAdvice } from "@/lib/searchGuidance";

type Comparable = {
  title: string;
  url: string;
  source: string;
  price: number;
  kind: "sold" | "asking" | "market_reference";
};

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
  comparables?: Comparable[];
  listing_check?: "reachable" | "unverified";
};

type StoredSearch = {
  query: string;
  deals: Deal[];
  meta?: {
    model?: string;
    result_count?: number;
    min_roi?: number | null;
    min_score?: number | null;
    min_profit?: number | null;
    max_ask_price?: number | null;
    condition_preference?: string;
    preferred_sites?: string[];
    plan?: string;
    subscription_status?: string;
    quality_version?: string;
    comparables_required?: number;
    listing_url_checks?: boolean;
    usage?: {
      used?: number;
      limit?: number;
      remaining?: number;
      period_days?: number;
    };
  } | null;
  filters?: {
    minRoi?: number | null;
    minScore?: number | null;
    minProfit?: number | null;
    maxAskPrice?: number | null;
    conditionPreference?: string;
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

const CONDITION_LABELS: Record<string, string> = {
  any: "Any condition",
  ready: "Ready to resell",
  cosmetic_ok: "Cosmetic work OK",
  repair_ok: "Repair projects OK",
};

function searchConfig(result: StoredSearch) {
  const minRoi = result.filters?.minRoi ?? result.meta?.min_roi ?? null;
  const minScore = result.filters?.minScore ?? result.meta?.min_score ?? null;
  const minProfit = result.filters?.minProfit ?? result.meta?.min_profit ?? null;
  const maxAskPrice = result.filters?.maxAskPrice ?? result.meta?.max_ask_price ?? null;
  const conditionPreference =
    result.filters?.conditionPreference ?? result.meta?.condition_preference ?? "any";

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

  return { minRoi, minScore, minProfit, maxAskPrice, conditionPreference, preferredSites };
}

function comparableLabel(kind: Comparable["kind"]) {
  if (kind === "sold") return "SOLD";
  if (kind === "asking") return "ASKING";
  return "MARKET";
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
        minProfit: config.minProfit,
        maxAskPrice: config.maxAskPrice,
        conditionPreference: config.conditionPreference,
      });
      setActionMessage("Search saved with all reseller filters.");
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
          minProfit: config.minProfit,
          maxAskPrice: config.maxAskPrice,
          conditionPreference: config.conditionPreference,
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
          minProfit: config.minProfit,
          maxAskPrice: config.maxAskPrice,
          conditionPreference: config.conditionPreference,
          preferredSiteIds: config.preferredSites,
          preferredSites: Array.isArray(data?.meta?.preferred_sites)
            ? data.meta.preferred_sites
            : [],
        },
        searchedAt: Date.now(),
      };

      sessionStorage.setItem("underask:last-search", JSON.stringify(nextResult));
      setResult(nextResult);
      setActionMessage("Fresh listings loaded. This rerun used 1 search.");
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
          <div className="navLinks"><a href="/search">Search</a><a href="/saved">Saved</a><a href="/pricing">Pricing</a></div>
        </nav>
        <section className="resultsHero"><div className="eyebrow">LOADING RESULTS</div><h1>Your deals are ready.</h1></section>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="shell">
        <nav className="nav">
          <a className="brand" href="/">UnderAsk</a>
          <div className="navLinks"><a href="/search">Search</a><a href="/saved">Saved</a><a href="/pricing">Pricing</a></div>
        </nav>
        <section className="resultsHero emptyResults">
          <div className="eyebrow">NO ACTIVE SEARCH</div>
          <h1>Start with a search.</h1>
          <p className="lede small">UnderAsk needs a fresh search before it can show ranked deals here.</p>
          <a className="buttonPrimary" href="/search">Find deals</a>
        </section>
      </main>
    );
  }

  const deals = Array.isArray(result.deals) ? result.deals : [];
  const config = searchConfig(result);
  const noResultsAdvice = getNoResultsAdvice({
    query: result.query,
    minRoi: config.minRoi,
    minScore: config.minScore,
    minProfit: config.minProfit,
    maxAskPrice: config.maxAskPrice,
  });
  const remaining = result.meta?.usage?.remaining;
  const limit = result.meta?.usage?.limit;
  const activeFilters = [
    config.maxAskPrice !== null ? `BUY ≤ €${config.maxAskPrice}` : null,
    config.minProfit !== null ? `PROFIT ≥ €${config.minProfit}` : null,
    config.minRoi !== null ? `ROI ≥ ${config.minRoi}%` : null,
    config.minScore !== null ? `AI ≥ ${config.minScore}/100` : null,
    config.conditionPreference !== "any"
      ? CONDITION_LABELS[config.conditionPreference] || config.conditionPreference
      : null,
  ].filter(Boolean) as string[];

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
            {result.meta?.quality_version && (
              <p className="lede small" style={{ marginTop: 8 }}>
                Quality checked · minimum {result.meta.comparables_required || 2} comparables per deal · duplicate filtering active.
              </p>
            )}
            {activeFilters.length > 0 && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
                {activeFilters.map((filter) => <span className="planBadge" key={filter}>{filter}</span>)}
              </div>
            )}
            {typeof remaining === "number" && typeof limit === "number" && (
              <p className="lede small" style={{ marginTop: 8 }}>{remaining} of {limit} searches remaining in your current allowance.</p>
            )}
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
          <span className="source">SEARCH COMPLETE · 1 SEARCH USED</span>
          <h2>{noResultsAdvice.title}</h2>
          <p>{noResultsAdvice.message}</p>
          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
              {activeFilters.map((filter) => <span className="planBadge" key={filter}>{filter}</span>)}
            </div>
          )}
          <a className="buttonPrimary" href="/search">Adjust search</a>
        </section>
      ) : (
        <section className="results">
          {deals.map((deal, index) => (
            <article className="dealCard" key={`${deal.url}-${index}`}>
              <div className="dealTop">
                <div><span className="source">#{index + 1} · {deal.source}</span><h2>{deal.title}</h2></div>
                <div className="score"><strong>{Math.round(deal.deal_score)}</strong><span>/100</span></div>
              </div>

              <div className="metrics">
                <div className="metric"><span>ASK</span><strong>€{deal.ask_price}</strong></div>
                <div className="metric"><span>COMP-BASED SALE</span><strong>€{deal.expected_sale_price}</strong></div>
                <div className="metric"><span>NET PROFIT</span><strong className="accent">€{deal.net_profit}</strong></div>
                <div className="metric"><span>ROI</span><strong className="accent">{deal.roi_percent}%</strong></div>
                <div className="metric"><span>QUICK SALE</span><strong>€{deal.quick_sale_price}</strong></div>
                <div className="metric"><span>CONFIDENCE</span><strong>{deal.confidence}%</strong></div>
                <div className="metric"><span>SELL SPEED</span><strong>{deal.speed_to_sell}/100</strong></div>
                <div className="metric"><span>PRICE GAP</span><strong>{deal.price_gap_percent}%</strong></div>
              </div>

              <p className="reasoning">{deal.reasoning}</p>

              <div className="detailGrid">
                <div><span className="detailLabel">MAIN RISK</span><p>{deal.risks?.[0] || "No major risk flagged."}</p></div>
                <div>
                  <span className="detailLabel">LISTING CHECK</span>
                  <p>{deal.listing_check === "reachable"
                    ? "Listing URL responded successfully during this search."
                    : "Direct URL found by live search; independent URL check was blocked or inconclusive."}</p>
                </div>
              </div>

              {Array.isArray(deal.comparables) && deal.comparables.length >= 2 && (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.10)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <span className="detailLabel">VALUE EVIDENCE</span>
                    <span className="source">{deal.comparables.length} COMPARABLES</span>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {deal.comparables.map((comp, compIndex) => (
                      <a
                        key={`${comp.url}-${compIndex}`}
                        href={comp.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
                          padding: "10px 12px", border: "1px solid rgba(255,255,255,.10)", borderRadius: 10,
                          color: "inherit", textDecoration: "none", background: "rgba(255,255,255,.025)",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 12 }}>{comp.title}</strong>
                          <span style={{ display: "block", marginTop: 2, fontSize: 10, opacity: 0.58 }}>{comparableLabel(comp.kind)} · {comp.source}</span>
                        </span>
                        <strong style={{ whiteSpace: "nowrap" }}>€{comp.price}</strong>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <a className="openLink" href={deal.url} target="_blank" rel="noreferrer">Open listing →</a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
