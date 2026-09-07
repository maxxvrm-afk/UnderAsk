"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import {
  fetchScoreboard,
  fetchSocialProfile,
  saveSocialProfile,
  type UnderAskScoreboardEntry,
} from "@/lib/underAskPortfolio";

function euro(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

export default function ScoreboardPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [metric, setMetric] = useState<"profit" | "roi">("profit");
  const [rows, setRows] = useState<UnderAskScoreboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadBoard(token: string, nextMetric: "profit" | "roi") {
    const data = await fetchScoreboard(token, nextMetric, 50);
    setRows(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/scoreboard");
          return;
        }
        const [profile, board] = await Promise.all([
          fetchSocialProfile(session.access_token),
          fetchScoreboard(session.access_token, "profit", 50),
        ]);
        if (!active) return;
        setAccessToken(session.access_token);
        setUserId(session.user.id);
        setDisplayName(profile.displayName || "");
        setOptIn(profile.scoreboardOptIn);
        setRows(board);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load the scoreboard.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [router]);

  async function changeMetric(next: "profit" | "roi") {
    if (!accessToken || next === metric) return;
    setMetric(next);
    setLoading(true);
    setError("");
    try {
      await loadBoard(accessToken, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the scoreboard.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !userId || saving) return;
    const cleanName = displayName.trim();
    if (optIn && (cleanName.length < 2 || cleanName.length > 40)) {
      setError("Choose a scoreboard display name between 2 and 40 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveSocialProfile(accessToken, userId, {
        displayName: cleanName || null,
        scoreboardOptIn: optIn,
      });
      await loadBoard(accessToken, metric);
      setMessage(optIn ? "You're on the scoreboard. Your sold flips now count toward both rankings." : "Scoreboard participation is off. Your portfolio stays private unless you share individual wins.");
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
          <a href="/search">Search</a>
          <a href="/portfolio">Portfolio</a>
          <a href="/feed">Wins</a>
          <a href="/saved">Saved</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 980 }}>
        <div className="eyebrow">COMMUNITY SCOREBOARD</div>
        <h1>Who is actually flipping best?</h1>
        <p className="lede small">Opt-in only. Rankings use self-reported sold Portfolio deals. Private deal details never appear on the scoreboard.</p>

        <form onSubmit={saveProfile} className="subscriptionGateCard" style={{ marginTop: 26, textAlign: "left" }}>
          <strong>Scoreboard profile</strong>
          <p>Choose whether your aggregate results appear publicly to other UnderAsk customers.</p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 12, alignItems: "end", marginTop: 14 }}>
            <label className="filterField" style={{ margin: 0 }}>
              <span>DISPLAY NAME</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="e.g. MaxFlips" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 44, cursor: "pointer" }}>
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span><strong style={{ display: "block" }}>Join scoreboard</strong><small style={{ opacity: .62 }}>Off by default</small></span>
            </label>
          </div>
          <button className="buttonPrimary" type="submit" disabled={saving} style={{ marginTop: 14 }}>{saving ? "Saving..." : "Save scoreboard settings"}</button>
        </form>

        {error && <p className="error" style={{ marginTop: 15 }}>{error}</p>}
        {message && <p className="lede small" style={{ marginTop: 15 }}>{message}</p>}

        <div style={{ display: "flex", gap: 9, marginTop: 28, justifyContent: "center", flexWrap: "wrap" }}>
          <button className={metric === "profit" ? "buttonPrimary" : "buttonGhost"} type="button" onClick={() => changeMetric("profit")}>Most € profit</button>
          <button className={metric === "roi" ? "buttonPrimary" : "buttonGhost"} type="button" onClick={() => changeMetric("roi")}>Best flip ROI</button>
        </div>

        {loading && <p className="lede small" style={{ marginTop: 24 }}>Loading scoreboard...</p>}

        {!loading && rows.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 26 }}>
            <strong>No ranked traders yet.</strong>
            <p>A user needs at least one sold Portfolio flip and must opt in before appearing here.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div style={{ display: "grid", gap: 9, marginTop: 26, textAlign: "left" }}>
            {rows.map((row) => (
              <article key={`${metric}-${row.rank}-${row.displayName}`} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) repeat(3,minmax(100px,auto))", gap: 13, alignItems: "center", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.025)" }}>
                <strong style={{ fontSize: 20 }}>#{row.rank}</strong>
                <span style={{ minWidth: 0 }}><strong style={{ display: "block", overflowWrap: "anywhere" }}>{row.displayName}</strong><small style={{ opacity: .55 }}>{row.soldCount} sold flip{row.soldCount === 1 ? "" : "s"} · self-reported</small></span>
                <span><small style={{ display: "block", opacity: .5 }}>TOTAL PROFIT</small><strong>{euro(row.totalProfit)}</strong></span>
                <span><small style={{ display: "block", opacity: .5 }}>BEST ROI</small><strong>{row.bestRoi.toFixed(1)}%</strong></span>
                <span><small style={{ display: "block", opacity: .5 }}>{metric === "profit" ? "RANK VALUE" : "RANK ROI"}</small><strong className="accent">{metric === "profit" ? euro(row.metricValue) : `${row.metricValue.toFixed(1)}%`}</strong></span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
