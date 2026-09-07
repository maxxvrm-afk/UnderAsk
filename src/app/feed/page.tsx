"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import { fetchWinsFeed, type UnderAskWin } from "@/lib/underAskPortfolio";

function euro(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export default function WinsFeedPage() {
  const router = useRouter();
  const [wins, setWins] = useState<UnderAskWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/feed");
          return;
        }
        const rows = await fetchWinsFeed(session.access_token, 40, 0);
        if (active) setWins(rows);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load the wins feed.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/search">Search</a>
          <a href="/portfolio">Portfolio</a>
          <a href="/scoreboard">Scoreboard</a>
          <a href="/saved">Saved</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 980 }}>
        <div className="eyebrow">MAIN WINS FEED</div>
        <h1>What UnderAsk traders are flipping.</h1>
        <p className="lede small">Only wins people chose to share appear here. Figures are self-reported and visible only to signed-in UnderAsk customers.</p>

        {loading && <p className="lede small" style={{ marginTop: 24 }}>Loading wins...</p>}
        {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

        {!loading && !error && wins.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 30 }}>
            <strong>No shared wins yet.</strong>
            <p>When someone marks a Portfolio flip as sold and chooses “Share this win to Feed”, it will appear here.</p>
            <a className="buttonPrimary" href="/portfolio">Open Portfolio</a>
          </div>
        )}

        {!loading && wins.length > 0 && (
          <div style={{ display: "grid", gap: 13, marginTop: 30, textAlign: "left" }}>
            {wins.map((win) => (
              <article className="dealCard" key={win.winId} style={{ margin: 0 }}>
                <div className="dealTop">
                  <div>
                    <span className="source">{win.displayName} · {win.source} · {date(win.soldAt)}</span>
                    <h2>{win.title}</h2>
                  </div>
                  <span className="planBadge">SELF-REPORTED WIN</span>
                </div>

                <div className="metrics">
                  <div className="metric"><span>BOUGHT</span><strong>{euro(win.purchasePrice)}</strong></div>
                  <div className="metric"><span>TOTAL INVESTED</span><strong>{euro(win.totalInvested)}</strong></div>
                  <div className="metric"><span>SOLD</span><strong>{euro(win.salePrice)}</strong></div>
                  <div className="metric"><span>PROFIT</span><strong className="accent">{euro(win.actualProfit)}</strong></div>
                  <div className="metric"><span>ROI</span><strong className="accent">{win.actualRoi.toFixed(1)}%</strong></div>
                </div>

                {win.shareNote && <p className="reasoning">“{win.shareNote}”</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
