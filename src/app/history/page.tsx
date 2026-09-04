"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession, signOutOwnTheWall } from "@/lib/ownTheWallAuth";
import {
  fetchUnderAskSearchHistory,
  fetchUnderAskUsage,
  type UnderAskSearchHistoryItem,
  type UnderAskUsage,
} from "@/lib/underAskUsage";

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
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<UnderAskSearchHistoryItem[]>([]);
  const [usage, setUsage] = useState<UnderAskUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/history");
          return;
        }

        const [nextHistory, nextUsage] = await Promise.all([
          fetchUnderAskSearchHistory(session.access_token, 60),
          fetchUnderAskUsage(session.access_token),
        ]);

        if (!active) return;
        setHistory(nextHistory);
        setUsage(nextUsage);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load search history.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  function logout() {
    signOutOwnTheWall();
    router.replace("/login");
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks accountNav">
          <a href="/search">Search</a>
          <a href="/pricing">Pricing</a>
          <button type="button" className="navButton" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 980 }}>
        <div className="eyebrow">SEARCH HISTORY</div>
        <h1>Your UnderAsk searches.</h1>
        <p className="lede small">
          Your searches are tied to your shared OWN THE WALL identity and are only visible to your account.
        </p>

        {usage && (
          <div className="accountLine">
            <span>{usage.used} used</span>
            <span>{usage.remaining} remaining</span>
            <span>{usage.limit} searches / rolling {usage.periodDays} days</span>
          </div>
        )}

        {loading && <p className="lede small">Loading history...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && history.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 28 }}>
            <strong>No searches yet.</strong>
            <p>Your completed and failed UnderAsk searches will appear here.</p>
            <a className="buttonPrimary" href="/search">Start searching</a>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div style={{ display: "grid", gap: 12, marginTop: 30, textAlign: "left" }}>
            {history.map((item) => {
              const sites = item.preferredSites.map((site) => SITE_NAMES[site] || site);
              const filters = [
                item.minRoi !== null ? `ROI ≥ ${item.minRoi}%` : null,
                item.minScore !== null ? `Score ≥ ${item.minScore}` : null,
                sites.length ? sites.join(" · ") : "Broad web",
              ].filter(Boolean);

              return (
                <article
                  key={item.id}
                  style={{
                    border: "1px solid rgba(255,255,255,.11)",
                    borderRadius: 16,
                    padding: "18px 18px 16px",
                    background: "rgba(255,255,255,.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 540px" }}>
                      <div style={{ fontSize: 11, letterSpacing: ".08em", opacity: .55, marginBottom: 7 }}>
                        {formatDate(item.createdAt)} · {item.plan.toUpperCase()}
                      </div>
                      <strong style={{ display: "block", fontSize: 17, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                        {item.query}
                      </strong>
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

                    <div style={{ textAlign: "right", minWidth: 110 }}>
                      <strong style={{ display: "block", fontSize: 12, textTransform: "uppercase" }}>
                        {item.status}
                      </strong>
                      <span style={{ display: "block", marginTop: 5, fontSize: 12, opacity: .58 }}>
                        {item.resultCount === null
                          ? item.status === "failed" ? "Search failed" : "Processing"
                          : `${item.resultCount} deal${item.resultCount === 1 ? "" : "s"}`}
                      </span>
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
