"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import {
  deleteUnderAskDealAlert,
  fetchUnderAskDealAlerts,
  markUnderAskAlertSeen,
  type UnderAskDealAlert,
} from "@/lib/underAskAlerts";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AlertsPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [alerts, setAlerts] = useState<UnderAskDealAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const unread = useMemo(() => alerts.filter((alert) => !alert.seenAt).length, [alerts]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/alerts");
          return;
        }
        const data = await fetchUnderAskDealAlerts(session.access_token, 100);
        if (!active) return;
        setAccessToken(session.access_token);
        setAlerts(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load Deal Alerts.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  async function openAlert(alert: UnderAskDealAlert) {
    if (!accessToken) return;
    if (!alert.seenAt) {
      markUnderAskAlertSeen(accessToken, alert.id).catch(() => null);
      setAlerts((current) =>
        current.map((item) =>
          item.id === alert.id ? { ...item, seenAt: new Date().toISOString() } : item,
        ),
      );
    }
    window.open(alert.url, "_blank", "noopener,noreferrer");
  }

  async function remove(alert: UnderAskDealAlert) {
    if (!accessToken || busyId) return;
    setBusyId(alert.id);
    setError("");
    try {
      await deleteUnderAskDealAlert(accessToken, alert.id);
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete alert.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks accountNav">
          <a href="/search">Search</a>
          <a href="/saved">Saved</a>
          <a href="/history">History</a>
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 1040 }}>
        <div className="eyebrow">DEAL ALERTS</div>
        <h1>{unread ? `${unread} new deal${unread === 1 ? "" : "s"}.` : "Your Deal Alerts."}</h1>
        <p className="lede small">
          UnderAsk only adds a notification when an automatic saved-search check finds a new listing that clears your alert threshold.
        </p>

        {loading && <p className="lede small">Loading alerts...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && alerts.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 28 }}>
            <strong>No Deal Alerts yet.</strong>
            <p>Enable an alert on one of your saved searches. New high-score listings will appear here.</p>
            <a className="buttonPrimary" href="/saved">Manage saved searches</a>
          </div>
        )}

        {!loading && alerts.length > 0 && (
          <div style={{ display: "grid", gap: 12, marginTop: 30, textAlign: "left" }}>
            {alerts.map((alert) => (
              <article
                key={alert.id}
                style={{
                  border: alert.seenAt
                    ? "1px solid rgba(255,255,255,.10)"
                    : "1px solid rgba(190,255,70,.32)",
                  borderRadius: 16,
                  padding: 18,
                  background: alert.seenAt
                    ? "rgba(255,255,255,.02)"
                    : "rgba(190,255,70,.035)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 580px" }}>
                    <div style={{ fontSize: 11, letterSpacing: ".08em", opacity: .55, marginBottom: 7 }}>
                      {alert.seenAt ? "SEEN" : "NEW"} · {alert.source} · {when(alert.createdAt)}
                    </div>
                    <strong style={{ display: "block", fontSize: 18, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                      {alert.title}
                    </strong>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <span style={{ fontSize: 12, padding: "5px 8px", border: "1px solid rgba(255,255,255,.10)", borderRadius: 999 }}>
                        Ask {money(alert.askPrice)}
                      </span>
                      <span style={{ fontSize: 12, padding: "5px 8px", border: "1px solid rgba(255,255,255,.10)", borderRadius: 999 }}>
                        Profit {money(alert.netProfit)}
                      </span>
                      <span style={{ fontSize: 12, padding: "5px 8px", border: "1px solid rgba(255,255,255,.10)", borderRadius: 999 }}>
                        ROI {alert.roiPercent === null ? "—" : `${Math.round(alert.roiPercent)}%`}
                      </span>
                      <span style={{ fontSize: 12, padding: "5px 8px", border: "1px solid rgba(255,255,255,.10)", borderRadius: 999 }}>
                        Score {Math.round(alert.dealScore)}/100
                      </span>
                    </div>

                    {alert.reasoning && (
                      <p style={{ margin: "13px 0 0", opacity: .72, lineHeight: 1.55 }}>
                        {alert.reasoning}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <button className="buttonPrimary" type="button" onClick={() => openAlert(alert)}>
                      Open listing
                    </button>
                    <button
                      className="buttonGhost"
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => remove(alert)}
                    >
                      {busyId === alert.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
