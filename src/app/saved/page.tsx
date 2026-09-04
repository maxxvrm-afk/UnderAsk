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

function formatDate(value: string) {
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
  const [error, setError] = useState("");

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

  async function remove(id: string) {
    if (!accessToken || deletingId) return;
    setDeletingId(id);
    setError("");
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
          <a href="/history">History</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 980 }}>
        <div className="eyebrow">SAVED SEARCHES</div>
        <h1>Your repeatable deal hunts.</h1>
        <p className="lede small">
          Save a strong search once, then rerun the exact same filters whenever you want fresh listings.
        </p>

        {loading && <p className="lede small">Loading saved searches...</p>}
        {error && <p className="error">{error}</p>}

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
                item.minRoi !== null ? `ROI ≥ ${item.minRoi}%` : null,
                item.minScore !== null ? `Score ≥ ${item.minScore}` : null,
                item.preferredSites.length
                  ? item.preferredSites.map((site) => SITE_NAMES[site] || site).join(" · ")
                  : "Broad web",
              ].filter(Boolean);

              return (
                <article
                  key={item.id}
                  style={{
                    border: "1px solid rgba(255,255,255,.11)",
                    borderRadius: 16,
                    padding: 18,
                    background: "rgba(255,255,255,.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 560px" }}>
                      <div style={{ fontSize: 11, letterSpacing: ".08em", opacity: .55, marginBottom: 7 }}>
                        SAVED {formatDate(item.createdAt)}
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
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="buttonPrimary"
                        disabled={Boolean(runningId || deletingId)}
                        onClick={() => run(item)}
                      >
                        {runningId === item.id ? "Searching..." : "Run now"}
                      </button>
                      <button
                        type="button"
                        className="buttonGhost"
                        disabled={Boolean(runningId || deletingId)}
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
