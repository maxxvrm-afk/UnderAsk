"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import { fetchUnderAskAiCapacity, type UnderAskAiCapacity } from "@/lib/underAskAiCapacity";

function pct(current: number, max: number) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

function number(value: number | null) {
  return value === null ? "Not measured yet" : new Intl.NumberFormat().format(value);
}

function duration(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function when(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

export default function CapacityPage() {
  const router = useRouter();
  const [data, setData] = useState<UnderAskAiCapacity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/capacity");
          return;
        }
        const next = await fetchUnderAskAiCapacity(session.access_token);
        if (!active) return;
        setData(next);
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        if (!active) return;
        if (err instanceof Error && err.message === "OWNER_ACCESS_REQUIRED") {
          setError("Owner access required.");
        } else {
          setError(err instanceof Error ? err.message : "Could not load AI capacity.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    refresh();
    timer = setInterval(refresh, 10000);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [router]);

  const load = useMemo(() => data ? pct(data.running, data.maxConcurrency) : 0, [data]);
  const paused = data?.pauseUntil ? new Date(data.pauseUntil).getTime() > Date.now() : false;

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/search">Search</a>
          <a href="/history">History</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 1040 }}>
        <div className="eyebrow">OWNER · AI CAPACITY</div>
        <h1>OpenAI traffic control.</h1>
        <p className="lede small">Live internal view of UnderAsk AI load. Refreshes every 10 seconds.</p>

        {loading && <p className="lede small">Loading capacity...</p>}
        {error && <p className="error">{error}</p>}

        {data && !error && (
          <>
            <div className="metrics" style={{ marginTop: 28 }}>
              <div className="metric"><span>RUNNING NOW</span><strong className="accent">{data.running} / {data.maxConcurrency}</strong></div>
              <div className="metric"><span>LOAD</span><strong>{load.toFixed(0)}%</strong></div>
              <div className="metric"><span>429s · 24H</span><strong>{data.rateLimited24h}</strong></div>
              <div className="metric"><span>REFUNDED · 24H</span><strong>{data.refunded24h}</strong></div>
            </div>

            <div style={{ marginTop: 18, height: 10, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.08)" }}>
              <div style={{ width: `${load}%`, height: "100%", background: "currentColor", transition: "width .25s ease" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 28, textAlign: "left" }}>
              <article className="subscriptionGateCard"><strong>Controller</strong><p>Manual slots: {data.maxConcurrency}<br />Alert ceiling: {data.alertMaxConcurrency}<br />Queued manual: {data.queuedManual}<br />Queued alerts: {data.queuedAlert}</p></article>
              <article className="subscriptionGateCard"><strong>24-hour traffic</strong><p>Jobs: {data.jobs24h}<br />Completed: {data.completed24h}<br />Failed: {data.failed24h}<br />Avg runtime: {duration(data.avgRuntimeMs)}</p></article>
              <article className="subscriptionGateCard"><strong>Token telemetry</strong><p>Input: {new Intl.NumberFormat().format(data.inputTokens24h)}<br />Output: {new Intl.NumberFormat().format(data.outputTokens24h)}<br />Remaining requests: {number(data.latestRemainingRequests)}<br />Remaining tokens: {number(data.latestRemainingTokens)}</p></article>
              <article className="subscriptionGateCard"><strong>Rate-limit state</strong><p>Status: {paused ? "PAUSED" : "OPEN"}<br />Pause until: {when(data.pauseUntil)}<br />Last rate limit: {when(data.lastRateLimitAt)}<br />Req reset: {data.latestResetRequests || "Not measured yet"}</p></article>
            </div>

            <div className="subscriptionGateCard" style={{ marginTop: 18, textAlign: "left" }}>
              <strong>Latest OpenAI headroom</strong>
              <p>Remaining requests: {number(data.latestRemainingRequests)} · Remaining tokens: {number(data.latestRemainingTokens)} · Token reset: {data.latestResetTokens || "Not measured yet"}</p>
              <small style={{ opacity: .55 }}>Request ID: {data.latestOpenAiRequestId || "Not measured yet"}</small>
            </div>

            <p className="lede small" style={{ marginTop: 16, fontSize: 12, opacity: .6 }}>
              {lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}.` : ""} Slots are intentionally conservative until real customer traffic gives enough data to raise them safely.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
