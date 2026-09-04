"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import {
  fetchUnderAskPreferences,
  saveUnderAskPreferences,
} from "@/lib/underAskPreferences";
import { getSearchGuidance } from "@/lib/searchGuidance";
import styles from "./onboarding.module.css";

const MARKETPLACES = [
  ["marktplaats", "Marktplaats"],
  ["ebay", "eBay"],
  ["2dehands", "2dehands"],
  ["kleinanzeigen", "Kleinanzeigen"],
  ["vinted", "Vinted"],
  ["catawiki", "Catawiki"],
  ["facebook", "Facebook Marketplace"],
  ["autoscout24", "AutoScout24"],
] as const;

function destination() {
  if (typeof window === "undefined") return "/pricing";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/pricing";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resellFocus, setResellFocus] = useState("");
  const [minRoi, setMinRoi] = useState("50");
  const [minScore, setMinScore] = useState("75");
  const [marketplace, setMarketplace] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace(`/login?next=${encodeURIComponent(`/onboarding?next=${destination()}`)}`);
          return;
        }

        const saved = await fetchUnderAskPreferences(session.access_token).catch(() => null);
        if (!mounted) return;

        setAccessToken(session.access_token);
        setUserId(session.user.id);
        if (saved) {
          setResellFocus(saved.resell_focus || "");
          setMinRoi(saved.default_min_roi === null ? "" : String(saved.default_min_roi));
          setMinScore(saved.default_min_score === null ? "" : String(saved.default_min_score));
          setMarketplace(saved.primary_marketplace || "");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const guidance = useMemo(
    () => getSearchGuidance({ query: resellFocus, minRoi, minScore }),
    [resellFocus, minRoi, minScore],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !accessToken || !userId) return;

    const cleanFocus = resellFocus.trim();
    const roi = minRoi === "" ? null : Number(minRoi);
    const score = minScore === "" ? null : Number(minScore);

    if (cleanFocus.length < 2) {
      setError("Tell UnderAsk what you normally resell.");
      return;
    }
    if (!marketplace) {
      setError("Choose your primary marketplace.");
      return;
    }
    if (roi !== null && (!Number.isFinite(roi) || roi < 0 || roi > 1000)) {
      setError("ROI must be between 0% and 1000%.");
      return;
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setError("AI score must be between 0 and 100.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await saveUnderAskPreferences(accessToken, userId, {
        resellFocus: cleanFocus,
        defaultMinRoi: roi,
        defaultMinScore: score,
        primaryMarketplace: marketplace,
      });
      router.replace(destination());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your setup.");
      setSaving(false);
    }
  }

  return (
    <main className={`shell ${styles.page}`}>
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/pricing">Pricing</a>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className="eyebrow">SET UP YOUR DEAL ENGINE</div>
        <h1>What should UnderAsk hunt for?</h1>
        <p className="lede small">
          Set sensible defaults once. UnderAsk will preload them every time you search,
          and warn you when your filters become so strict that good listings are likely to disappear.
        </p>
      </section>

      <form className={styles.card} onSubmit={submit}>
        {loading ? (
          <p className="lede small">Loading your setup...</p>
        ) : (
          <>
            <div className={styles.grid}>
              <label className={`${styles.field} ${styles.full}`}>
                <span>WHAT DO YOU RESELL?</span>
                <input
                  value={resellFocus}
                  onChange={(event) => setResellFocus(event.target.value)}
                  placeholder="e.g. Pokémon cards, car parts, cameras, vintage audio"
                  maxLength={500}
                />
                <small>Be specific enough to give the first search direction, but do not write a full shopping list.</small>
              </label>

              <label className={styles.field}>
                <span>DEFAULT MINIMUM ROI</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  value={minRoi}
                  onChange={(event) => setMinRoi(event.target.value)}
                  placeholder="50"
                />
                <small>50–100% is a strong starting range. You can always push it higher later.</small>
              </label>

              <label className={styles.field}>
                <span>DEFAULT MINIMUM AI SCORE</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={minScore}
                  onChange={(event) => setMinScore(event.target.value)}
                  placeholder="75"
                />
                <small>75–85 keeps quality high without demanding near-perfect deals.</small>
              </label>

              <label className={`${styles.field} ${styles.full}`}>
                <span>PRIMARY MARKETPLACE</span>
                <select value={marketplace} onChange={(event) => setMarketplace(event.target.value)}>
                  <option value="">Choose a marketplace</option>
                  {MARKETPLACES.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <small>This is a priority, not a hard wall. UnderAsk can still use the broader public web for stronger deals and market evidence.</small>
              </label>
            </div>

            {guidance.length > 0 && (
              <div className={styles.guidance}>
                {guidance.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={`${styles.guidanceItem} ${item.severity === "danger" ? styles.danger : item.severity === "warning" ? styles.warning : ""}`}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="error" style={{ marginTop: 18 }}>{error}</p>}

            <div className={styles.actions}>
              <p className={styles.creditNote}>
                Extreme settings are allowed. UnderAsk warns you first, but if you choose to run a valid search anyway, it consumes 1 search even when zero deals pass your filters.
              </p>
              <button className="buttonPrimary" type="submit" disabled={saving}>
                {saving ? "Saving setup..." : destination() === "/pricing" ? "Save & choose a plan" : "Save preferences"}
              </button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
