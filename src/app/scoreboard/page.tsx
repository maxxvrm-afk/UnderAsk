"use client";

import { FormEvent, useEffect, useState } from "react";
import { getValidOwnTheWallSession, type OtwSession } from "@/lib/ownTheWallAuth";
import {
  fetchSocialProfile,
  saveSocialProfile,
  type UnderAskScoreboardEntry,
} from "@/lib/underAskPortfolio";
import {
  fetchPublicScoreboard,
  fetchPublicScoreboardSummary,
  type UnderAskScoreboardSummary,
} from "@/lib/underAskPublicScoreboard";

function euro(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ScoreboardPage() {
  const [session, setSession] = useState<OtwSession | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [metric, setMetric] = useState<"profit" | "roi">("profit");
  const [rows, setRows] = useState<UnderAskScoreboardEntry[]>([]);
  const [summary, setSummary] = useState<UnderAskScoreboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPublic(nextMetric: "profit" | "roi") {
    const [board, totals] = await Promise.all([
      fetchPublicScoreboard(nextMetric, 50),
      fetchPublicScoreboardSummary(),
    ]);
    setRows(board);
    setSummary(totals);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [board, totals, activeSession] = await Promise.all([
          fetchPublicScoreboard("profit", 50),
          fetchPublicScoreboardSummary(),
          getValidOwnTheWallSession().catch(() => null),
        ]);
        if (!active) return;
        setRows(board);
        setSummary(totals);
        setSession(activeSession);

        if (activeSession) {
          const profile = await fetchSocialProfile(activeSession.access_token);
          if (!active) return;
          setDisplayName(profile.displayName || "");
          setOptIn(profile.scoreboardOptIn);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load the scoreboard.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  async function changeMetric(next: "profit" | "roi") {
    if (next === metric) return;
    setMetric(next);
    setLoading(true);
    setError("");
    try {
      await loadPublic(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the scoreboard.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session || saving) return;
    const cleanName = displayName.trim();
    if (optIn && (cleanName.length < 2 || cleanName.length > 40)) {
      setError("Choose a scoreboard display name between 2 and 40 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveSocialProfile(session.access_token, session.user.id, {
        displayName: cleanName || null,
        scoreboardOptIn: optIn,
      });
      await loadPublic(metric);
      setMessage(
        optIn
          ? "You're on the public scoreboard. Only your display name and aggregate sold-flip results are shown."
          : "Scoreboard participation is off. Your portfolio remains private unless you share individual wins.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update scoreboard settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          {session ? <a href="/search">Search</a> : <a href="/login">Sign in</a>}
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 1040 }}>
        <div className="eyebrow">PUBLIC COMMUNITY SCOREBOARD</div>
        <h1>See what UnderAsk traders are making.</h1>
        <p className="lede small">
          Real Portfolio results from traders who chose to appear publicly. See the profit and ROI being captured before you decide whether UnderAsk is worth it for you.
        </p>

        <div className="metrics" style={{ marginTop: 28 }}>
          <div className="metric"><span>TRACKED PROFIT</span><strong className="accent">{summary ? euro(summary.totalProfit) : "—"}</strong></div>
          <div className="metric"><span>SOLD FLIPS</span><strong>{summary ? summary.soldCount : "—"}</strong></div>
          <div className="metric"><span>RANKED TRADERS</span><strong>{summary ? summary.traderCount : "—"}</strong></div>
          <div className="metric"><span>BEST FLIP ROI</span><strong className="accent">{summary ? `${summary.bestRoi.toFixed(1)}%` : "—"}</strong></div>
        </div>
        <p className="lede small" style={{ marginTop: 10, fontSize: 12, opacity: .62 }}>
          Results are self-reported from sold Portfolio flips and only include users who explicitly opted into the public scoreboard. Past performance does not guarantee future results.
        </p>

        {!session && (
          <div className="subscriptionGateCard" style={{ marginTop: 26, textAlign: "left" }}>
            <strong>How much are you leaving on the table?</strong>
            <p>Start with 7 days and up to 10 live searches. Track every deal from purchase to actual profit.</p>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
              <a className="buttonPrimary" href="/pricing">Start 7-day free trial</a>
              <a className="buttonGhost" href="/signup?next=/pricing">Create account</a>
            </div>
          </div>
        )}

        {session && (
          <form onSubmit={saveProfile} className="subscriptionGateCard" style={{ marginTop: 26, textAlign: "left" }}>
            <strong>Your scoreboard profile</strong>
            <p>Participation is optional. Your private Portfolio and account details are never exposed here.</p>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 12, alignItems: "end", marginTop: 14 }}>
              <label className="filterField" style={{ margin: 0 }}>
                <span>DISPLAY NAME</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="e.g. MaxFlips" />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 44, cursor: "pointer" }}>
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                <span><strong style={{ display: "block" }}>Join public scoreboard</strong><small style={{ opacity: .62 }}>Off by default</small></span>
              </label>
            </div>
            <button className="buttonPrimary" type="submit" disabled={saving} style={{ marginTop: 14 }}>
              {saving ? "Saving..." : "Save scoreboard settings"}
            </button>
          </form>
        )}

        {error && <p className="error" style={{ marginTop: 15 }}>{error}</p>}
        {message && <p className="lede small" style={{ marginTop: 15 }}>{message}</p>}

        <div style={{ display: "flex", gap: 9, marginTop: 30, justifyContent: "center", flexWrap: "wrap" }}>
          <button className={metric === "profit" ? "buttonPrimary" : "buttonGhost"} type="button" onClick={() => changeMetric("profit")}>Most € profit</button>
          <button className={metric === "roi" ? "buttonPrimary" : "buttonGhost"} type="button" onClick={() => changeMetric("roi")}>Best flip ROI</button>
        </div>

        {loading && <p className="lede small" style={{ marginTop: 24 }}>Loading live scoreboard...</p>}

        {!loading && rows.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 26 }}>
            <strong>No public rankings yet.</strong>
            <p>The first trader with a sold Portfolio flip who opts in will appear here. UnderAsk never invents demonstration profits.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div style={{ display: "grid", gap: 9, marginTop: 26, textAlign: "left" }}>
            {rows.map((row) => (
              <article key={`${metric}-${row.rank}-${row.displayName}`} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) repeat(3,minmax(100px,auto))", gap: 13, alignItems: "center", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.025)" }}>
                <strong style={{ fontSize: 20 }}>#{row.rank}</strong>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{row.displayName}</strong>
                  <small style={{ opacity: .55 }}>{row.soldCount} sold flip{row.soldCount === 1 ? "" : "s"} · self-reported</small>
                </span>
                <span><small style={{ display: "block", opacity: .5 }}>TOTAL PROFIT</small><strong>{euro(row.totalProfit)}</strong></span>
                <span><small style={{ display: "block", opacity: .5 }}>BEST ROI</small><strong>{row.bestRoi.toFixed(1)}%</strong></span>
                <span><small style={{ display: "block", opacity: .5 }}>{metric === "profit" ? "RANK VALUE" : "RANK ROI"}</small><strong className="accent">{metric === "profit" ? euro(row.metricValue) : `${row.metricValue.toFixed(1)}%`}</strong></span>
              </article>
            ))}
          </div>
        )}

        {!session && rows.length > 0 && (
          <div style={{ marginTop: 30, textAlign: "center" }}>
            <p className="lede small" style={{ margin: "0 auto 16px" }}>They found their flips. What will UnderAsk find for you?</p>
            <a className="buttonPrimary" href="/pricing">Try UnderAsk free for 7 days</a>
          </div>
        )}
      </section>
    </main>
  );
}
