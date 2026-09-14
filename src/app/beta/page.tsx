"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanId } from "@/lib/searchPlans";
import { getValidOwnTheWallSession, type OtwSession } from "@/lib/ownTheWallAuth";
import {
  fetchUnderAskBetaUsers,
  grantUnderAskBeta,
  revokeUnderAskBeta,
  type UnderAskBetaUser,
} from "@/lib/underAskBetaAdmin";

const plans: Array<{ value: PlanId; label: string }> = [
  { value: "scout", label: "Scout" },
  { value: "pro", label: "Pro" },
  { value: "multi-pro", label: "Multi Pro" },
  { value: "business", label: "Business" },
];

function planLabel(plan: string) {
  return plan === "multi-pro" ? "Multi Pro" : plan.charAt(0).toUpperCase() + plan.slice(1);
}

function dateLabel(value: string | null) {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function BetaPage() {
  const router = useRouter();
  const [session, setSession] = useState<OtwSession | null>(null);
  const [users, setUsers] = useState<UnderAskBetaUser[]>([]);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanId>("pro");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowAlerts, setAllowAlerts] = useState(true);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const activeSession = await getValidOwnTheWallSession();
      if (!activeSession) {
        router.replace("/login?next=/beta");
        return;
      }
      setSession(activeSession);
      const next = await fetchUnderAskBetaUsers(activeSession.access_token);
      setUsers(next);
      setError("");
    } catch (err: any) {
      if (err?.code === "OWNER_ACCESS_REQUIRED") setError("Owner access required.");
      else setError(err instanceof Error ? err.message : "Could not load beta access.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(() => users.filter((user) => user.enabled).length, [users]);
  const searchesUsed = useMemo(() => users.reduce((sum, user) => sum + user.used, 0), [users]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let expiry: string | null = null;
      if (expiresAt) {
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid expiry date.");
        expiry = parsed.toISOString();
      }
      await grantUnderAskBeta(session.access_token, {
        email: email.trim(),
        plan,
        expiresAt: expiry,
        allowAlerts,
        note: note.trim() || null,
      });
      setNotice(`Beta access enabled for ${email.trim()}.`);
      setEmail("");
      setNote("");
      setExpiresAt("");
      await load();
    } catch (err: any) {
      if (err?.code === "USER_NOT_FOUND") setError("No UnderAsk account exists for that email yet. Let the tester create an account first, then grant beta access here.");
      else if (err?.code === "INVALID_EMAIL") setError("Enter a valid email address.");
      else if (err?.code === "INVALID_EXPIRY") setError("Expiry must be in the future.");
      else setError(err instanceof Error ? err.message : "Could not grant beta access.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(user: UnderAskBetaUser) {
    if (!session || saving || session.user.id === user.userId) return;
    if (!window.confirm(`Revoke beta access for ${user.email}?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await revokeUnderAskBeta(session.access_token, user.userId);
      setNotice(`Beta access revoked for ${user.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke beta access.");
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
          <a href="/capacity">Capacity</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 1100 }}>
        <div className="eyebrow">OWNER · BETA CONTROL</div>
        <h1>Control the first testers.</h1>
        <p className="lede small">Grant temporary UnderAsk access without changing Stripe billing. Only existing accounts can be added.</p>

        <div className="metrics" style={{ marginTop: 28 }}>
          <div className="metric"><span>ACTIVE BETA</span><strong>{activeCount}</strong></div>
          <div className="metric"><span>TOTAL BETA ROWS</span><strong>{users.length}</strong></div>
          <div className="metric"><span>SEARCHES · 30D</span><strong>{searchesUsed}</strong></div>
        </div>

        <form onSubmit={submit} className="subscriptionGateCard" style={{ marginTop: 26, textAlign: "left", display: "grid", gap: 12 }}>
          <strong>Grant or update beta access</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: .65 }}>Tester email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="tester@example.com" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: .65 }}>Beta plan</span>
              <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
                {plans.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: .65 }}>Expiry · optional</span>
              <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="datetime-local" />
            </label>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: .65 }}>Internal note · optional</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. reseller beta · feedback call Friday" />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
            <input type="checkbox" checked={allowAlerts} onChange={(e) => setAllowAlerts(e.target.checked)} />
            Deal Alerts enabled for this beta user
          </label>
          <div>
            <button className="buttonPrimary" type="submit" disabled={saving}>{saving ? "Saving..." : "Grant beta access"}</button>
          </div>
        </form>

        {notice && <p className="billingNotice">{notice}</p>}
        {error && <p className="error">{error}</p>}
        {loading && <p className="lede small">Loading beta users...</p>}

        {!loading && !error && (
          <div style={{ display: "grid", gap: 12, marginTop: 24, textAlign: "left" }}>
            {users.length === 0 && <div className="subscriptionGateCard"><strong>No beta users yet.</strong><p>Add the first tester above after they create an UnderAsk account.</p></div>}
            {users.map((user) => {
              const isOwner = session?.user.id === user.userId;
              const usagePct = user.limit > 0 ? Math.min(100, (user.used / user.limit) * 100) : 0;
              return (
                <article className="subscriptionGateCard" key={user.userId}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <strong>{user.email}{isOwner ? " · OWNER" : ""}</strong>
                      <p style={{ margin: "6px 0 0" }}>
                        {planLabel(user.plan)} beta · {user.enabled ? "ACTIVE" : "INACTIVE"} · Alerts {user.allowAlerts ? "ON" : "OFF"}<br />
                        Expires: {dateLabel(user.expiresAt)} · Stripe: {planLabel(user.billingPlan)} / {user.billingStatus}
                        {user.note ? <><br />Note: {user.note}</> : null}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong>{user.used.toLocaleString()} / {user.limit.toLocaleString()}</strong>
                      <p style={{ margin: "4px 0 0" }}>{user.remaining.toLocaleString()} searches left</p>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ width: `${usagePct}%`, height: "100%", background: "currentColor" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="buttonGhost compactButton"
                      disabled={saving}
                      onClick={() => {
                        setEmail(user.email);
                        setPlan(user.plan);
                        setAllowAlerts(user.allowAlerts);
                        setNote(user.note || "");
                        setExpiresAt(user.expiresAt ? new Date(user.expiresAt).toISOString().slice(0,16) : "");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </button>
                    {!isOwner && user.enabled && (
                      <button type="button" className="cancelSubscriptionButton" disabled={saving} onClick={() => revoke(user)}>Revoke</button>
                    )}
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
