"use client";

import { useEffect, useState } from "react";
import {
  fetchPublicScoreboard,
  fetchPublicScoreboardSummary,
  type UnderAskScoreboardSummary,
} from "@/lib/underAskPublicScoreboard";
import type { UnderAskScoreboardEntry } from "@/lib/underAskPortfolio";

function euro(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function HomePage() {
  const [summary, setSummary] = useState<UnderAskScoreboardSummary | null>(null);
  const [leaders, setLeaders] = useState<UnderAskScoreboardEntry[]>([]);
  const [proofLoading, setProofLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchPublicScoreboardSummary(),
      fetchPublicScoreboard("profit", 3),
    ])
      .then(([totals, board]) => {
        if (!active) return;
        setSummary(totals);
        setLeaders(board);
      })
      .catch(() => {
        if (!active) return;
        setSummary(null);
        setLeaders([]);
      })
      .finally(() => {
        if (active) setProofLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/scoreboard">Scoreboard</a>
          <a href="/pricing">Pricing</a>
          <a href="/login">Sign in</a>
        </div>
      </nav>

      <section className="hero">
        <div className="eyebrow">AI DEAL SEARCH FOR RESELLERS</div>
        <h1>Find the margin before everyone else.</h1>
        <p className="lede">
          Tell UnderAsk what you want to flip. It searches live listings, checks comparable prices,
          estimates real profit and ranks the opportunities worth your time.
        </p>
        <div className="heroActions">
          <a className="buttonPrimary" href="/pricing">Start 7-day free trial</a>
          <a className="buttonGhost" href="/scoreboard">See community results</a>
        </div>
        <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
          7 days · up to 10 live searches · cancel before the trial ends
        </p>
      </section>

      <section style={{ padding: "18px 0 88px" }}>
        <div className="eyebrow">COMMUNITY PROOF</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(34px,5vw,60px)", letterSpacing: "-.05em", lineHeight: 1 }}>
              See what traders are actually making.
            </h2>
            <p className="lede small" style={{ marginTop: 16 }}>
              Results come from sold Portfolio flips shared by users who explicitly opted into the public scoreboard.
            </p>
          </div>
          <a className="buttonGhost" href="/scoreboard">Open full scoreboard →</a>
        </div>

        <div className="metrics" style={{ marginTop: 28 }}>
          <div className="metric">
            <span>TRACKED PROFIT</span>
            <strong className="accent">{summary ? euro(summary.totalProfit) : proofLoading ? "…" : "€0"}</strong>
          </div>
          <div className="metric">
            <span>SOLD FLIPS</span>
            <strong>{summary ? summary.soldCount : proofLoading ? "…" : 0}</strong>
          </div>
          <div className="metric">
            <span>RANKED TRADERS</span>
            <strong>{summary ? summary.traderCount : proofLoading ? "…" : 0}</strong>
          </div>
          <div className="metric">
            <span>BEST FLIP ROI</span>
            <strong className="accent">{summary ? `${summary.bestRoi.toFixed(1)}%` : proofLoading ? "…" : "0.0%"}</strong>
          </div>
        </div>

        {leaders.length > 0 ? (
          <div style={{ display: "grid", gap: 9, marginTop: 18 }}>
            {leaders.map((row) => (
              <a
                href="/scoreboard"
                key={`${row.rank}-${row.displayName}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "46px minmax(0,1fr) auto auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 16px",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,.025)",
                }}
              >
                <strong>#{row.rank}</strong>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{row.displayName}</strong>
                  <small style={{ color: "var(--muted)" }}>{row.soldCount} sold flip{row.soldCount === 1 ? "" : "s"}</small>
                </span>
                <span><small style={{ display: "block", color: "var(--muted)" }}>PROFIT</small><strong>{euro(row.totalProfit)}</strong></span>
                <span><small style={{ display: "block", color: "var(--muted)" }}>BEST ROI</small><strong className="accent">{row.bestRoi.toFixed(1)}%</strong></span>
              </a>
            ))}
          </div>
        ) : !proofLoading ? (
          <div className="subscriptionGateCard" style={{ marginTop: 18, textAlign: "left" }}>
            <strong>The scoreboard is ready for the first verified community entries.</strong>
            <p>UnderAsk does not invent demo profit. Public numbers appear only when real users log sold Portfolio flips and opt in.</p>
          </div>
        ) : null}

        <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 11 }}>
          Community figures are self-reported. Past performance does not guarantee future results.
        </p>
      </section>

      <section className="valueGrid">
        <article className="valueCard">
          <span>01 · SEARCH</span>
          <h3>Describe the deal.</h3>
          <p>Set marketplace, budget, minimum ROI, minimum net profit, score and condition preferences.</p>
        </article>
        <article className="valueCard">
          <span>02 · VERIFY</span>
          <h3>UnderAsk checks the evidence.</h3>
          <p>Listings are compared against multiple market comparables before expected resale value and ROI are shown.</p>
        </article>
        <article className="valueCard">
          <span>03 · TRACK</span>
          <h3>Turn finds into a portfolio.</h3>
          <p>Mark a deal as bought, log fuel, repairs, ads, fees and shipping, then compare predicted profit with the final result.</p>
        </article>
      </section>

      <section style={{ padding: "20px 0 110px", textAlign: "center" }}>
        <div className="eyebrow">START WITH 10 SEARCHES</div>
        <h2 style={{ margin: "0 auto", maxWidth: 820, fontSize: "clamp(36px,6vw,68px)", letterSpacing: "-.055em", lineHeight: 1 }}>
          Find one good flip. Let the numbers decide the rest.
        </h2>
        <p className="lede small" style={{ margin: "20px auto 0" }}>
          Start a 7-day trial, use up to 10 live searches and keep every purchase and cost in one Portfolio.
        </p>
        <div className="heroActions" style={{ justifyContent: "center" }}>
          <a className="buttonPrimary" href="/pricing">Start 7-day free trial</a>
          <a className="buttonGhost" href="/login">Sign in</a>
        </div>
      </section>
    </main>
  );
}
