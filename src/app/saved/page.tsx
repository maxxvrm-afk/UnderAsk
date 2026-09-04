"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getValidOwnTheWallSession,
  signOutOwnTheWall,
} from "@/lib/ownTheWallAuth";
import {
  deleteUnderAskSavedSearch,
  fetchUnderAskSavedSearches,
  setUnderAskSavedSearchAlert,
  type UnderAskSavedSearch,
} from "@/lib/underAskSavedSearches";

const SITE_NAMES: Record<string, string> = {
  marktplaats: "Marktplaats",
  ebay: "eBay",
  "2dehands": "2dehands",
  kleinanzeigen: "Kleinanzeigen",
  vinted: "Vinted",
  catawiki: "Catawiki",
  facebook: "Facebook Marketplace",
  autoscout24: "AutoScout24",
};

const CONDITION_NAMES: Record<string, string> = {
  any: "Any condition",
  ready: "Ready to resell",
  cosmetic_ok: "Cosmetic work OK",
  repair_ok: "Repair projects OK",
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [items, setItems] = useState<UnderAskSavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/saved");
          return;
        }
        const nextItems = await fetchUnderAskSavedSearches(session.access_token);
        if (!active) return;
        setAccessToken(session.access_token);
        setItems(nextItems);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load saved searches.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  async function run(search: UnderAskSavedSearch) {
    if (!accessToken || runningId) return;
    setRunningId(search.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/search/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: search.query,
          minRoi: search.minRoi,
          minScore: search.minScore,
          minProfit: search.minProfit,
          maxAskPrice: search.maxAskPrice,
          conditionPreference: search.conditionPreference,
          preferredSites: search.preferredSites,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        signOutOwnTheWall();
        router.replace("/login?next=/saved");
        return;
      }

      if (response.status === 402) {
        router.replace("/pricing");
        return;
      }

      if (!response.ok) throw new Error(data.error || "Search failed.");

      sessionStorage.setItem(
        "underask:last-search",
        JSON.stringify({
          query: search.query,
          deals: Array.isArray(data.deals) ? data.deals : [],
          meta: data.meta || null,
          filters: {
            minRoi: search.minRoi,
            minScore: search.minScore,
            minProfit: search.minProfit,
            maxAskPrice: search.maxAskPrice,
            conditionPreference: search.conditionPreference,
            preferredSiteIds: search.preferredSites,
            preferredSites: search.preferredSites.map((site) => SITE_NAMES[site] || site),
          },
          searchedAt: Date.now(),
        }),
      );

      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run saved search.");
      setRunningId("");
    }
  }

  async function toggleAlert(search: UnderAskSavedSearch) {
    if (!accessToken || togglingId) return;
    setTogglingId(search.id);
    setError("");
    setMessage("");

    try {
      const state = await setUnderAskSavedSearchAlert(
        accessToken,
        search.id,
        !search.alertsEnabled,
      );

      setItems((current) =>
        current.map((item) =>
          item.id === search.id
            ? {
                ...item,
                alertsEnabled: state.enabled,
                alertMinScore: state.alertMinScore,
                nextCheckAt: state.nextCheckAt,
                alertLastError: null,
              }
            : item,
        ),
      );

      setMessage(
        state.enabled
          ? `Deal Alert enabled. ${state.activeCount}/${state.maxActive} active on your plan; checking about every ${state.frequencyHours}h with the same budget/profit filters.`
          : "Deal Alert disabled.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Deal Alert.");
    } finally {
      setTogglingId("");
    }
  }

  async function remove(id: string) {
    if (!accessToken || deletingId) return;
    setDeletingId(id);
    setError("");
    setMessage("");
    try {
      await deleteUnderAskSavedSearch(accessToken, id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete saved search.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks accountNav">
          <a href="/search">Search</a>
          <a href="/alerts">Alerts</a>
          <a href="/history">History</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 980 }}>
        <div className="eyebrow">SAVED SEARCHES + DEAL ALERTS</div>
        <h1>Your repeatable deal hunts.</h1>
        <p className="lede small">
          Saved searches now keep the actual economics too: buying budget, required net profit, ROI, score and acceptable condition.
        </p>

        {loading && <p className="lede small">Loading saved searches...</p>}
        {error && <p className="error">{error}</p>}
        {message && <p className="lede small" style={{ marginTop: 14 }}>{message}</p>}

        {!loading && !error && items.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 28 }}>
            <strong>No saved searches yet.</strong>
            <p>Run a search, then save it from the results page.</p>
            <a className="buttonPrimary" href="/search">Find deals</a>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: "grid", gap: 12, marginTop: 30, textAlign: "left" }}>
            {items.map((item) => {
              const filters = [
                item.maxAskPrice !== null ? `Buy ≤ €${item.maxAskPrice}` : null,
                item.minProfit !== null ? `Profit ≥ €${item.minProfit}` : null,
                item.minRoi !== null ? `ROI ≥ ${item.minRoi}%` : null,
                item.minScore !== null ? `Score ≥ ${item.minScore}` : null,
                item.conditionPreference !== "any" ? CONDITION_NAMES[item.conditionPreference] : null,
                item.preferredSites.length
                  ? item.preferredSites.map((site) => SITE_NAMES[site] || site).join(" · ")
                  : "Broad web",
              ].filter(Boolean);

              return (
                <article
                  key={item.id}
                  style={{
                    border: item.alertsEnabled
                      ? "1px solid rgba(190,255,70,.28)"
                      : "1px solid rgba(255,255,255,.11)",
                    borderRadius: 16,
                    padding: 18,
                    background: "rgba(255,255,255,.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 560px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                        <span style={{ fontSize: 11, letterSpacing: ".08em", opacity: .55 }}>SAVED {formatDate(item.createdAt)}</span>
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: ".08em",
                            padding: "4px 7px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,.12)",
                            opacity: item.alertsEnabled ? 1 : .58,
                          }}
                        >
                          ALERT {item.alertsEnabled ? "ON" : "OFF"}
                        </span>
                      </div>

                      <strong style={{ display: "block", fontSize: 17, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                        {item.name || item.query}
                      </strong>
                      {item.name && <p style={{ margin: "7px 0 0", opacity: .72 }}>{item.query}</p>}

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}>
                        {filters.map((filter) => (
                          <span
                            key={String(filter)}
                            style={{
                              fontSize: 11,
                              padding: "5px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,.10)",
                              opacity: .72,
                            }}
                          >
                            {filter}
                          </span>
                        ))}
                        {item.alertsEnabled && (
                          <span style={{ fontSize: 11, padding: "5px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.10)", opacity: .72 }}>
                            Alert score ≥ {Math.round(item.alertMinScore)}
                          </span>
                        )}
                      </div>

                      {item.alertsEnabled && (
                        <p style={{ margin: "11px 0 0", fontSize: 12, opacity: .58 }}>
                          {item.nextCheckAt ? `Next check: ${formatDate(item.nextCheckAt)}` : "Waiting for next check"}
                          {item.lastAlertAt ? ` · Last new deal: ${formatDate(item.lastAlertAt)}` : ""}
                        </p>
                      )}
                      {item.alertLastError && (
                        <p className="error" style={{ marginTop: 10, fontSize: 12 }}>Last alert check failed; UnderAsk will retry automatically.</p>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={item.alertsEnabled ? "buttonGhost" : "buttonPrimary"}
                        disabled={Boolean(runningId || deletingId || togglingId)}
                        onClick={() => toggleAlert(item)}
                      >
                        {togglingId === item.id ? "Updating..." : item.alertsEnabled ? "Disable alert" : "Enable alert"}
                      </button>
                      <button
                        type="button"
                        className="buttonPrimary"
                        disabled={Boolean(runningId || deletingId || togglingId)}
                        onClick={() => run(item)}
                      >
                        {runningId === item.id ? "Searching..." : "Run now"}
                      </button>
                      <button
                        type="button"
                        className="buttonGhost"
                        disabled={Boolean(runningId || deletingId || togglingId)}
                        onClick={() => remove(item.id)}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
