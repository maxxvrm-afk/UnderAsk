"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchUnderAskEntitlement,
  getValidOwnTheWallSession,
  type UnderAskEntitlement,
} from "@/lib/ownTheWallAuth";
import { fetchUnderAskUsage, type UnderAskUsage } from "@/lib/underAskUsage";

const VISIBLE_PATHS = new Set([
  "/search",
  "/results",
  "/history",
  "/saved",
  "/alerts",
  "/pricing",
]);

const DAY = 86_400_000;

function trialProgress(trialEnd: string | null) {
  if (!trialEnd) return null;
  const end = new Date(trialEnd).getTime();
  if (!Number.isFinite(end)) return null;

  const now = Date.now();
  const remainingMs = Math.max(0, end - now);
  const elapsedMs = Math.min(7 * DAY, Math.max(0, 7 * DAY - remainingMs));
  const day = Math.min(7, Math.max(1, Math.floor(elapsedMs / DAY) + 1));

  let remainingLabel: string;
  if (remainingMs <= 0) {
    remainingLabel = "ending now";
  } else if (remainingMs < DAY) {
    const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
    remainingLabel = `${hours}h left`;
  } else {
    const days = Math.ceil(remainingMs / DAY);
    remainingLabel = `${days}d left`;
  }

  return { day, remainingLabel };
}

function planLabel(plan: string) {
  if (plan === "multi-pro") return "Multi Pro";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export default function UnderAskUsageWidget() {
  const pathname = usePathname();
  const [usage, setUsage] = useState<UnderAskUsage | null>(null);
  const [entitlement, setEntitlement] = useState<UnderAskEntitlement | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!VISIBLE_PATHS.has(pathname)) {
        if (active) {
          setUsage(null);
          setEntitlement(null);
        }
        return;
      }

      try {
        const session = await getValidOwnTheWallSession();
        if (!session) return;
        const [nextUsage, nextEntitlement] = await Promise.all([
          fetchUnderAskUsage(session.access_token),
          fetchUnderAskEntitlement(session.access_token),
        ]);
        if (active) {
          setUsage(nextUsage);
          setEntitlement(nextEntitlement);
        }
      } catch {
        if (active) {
          setUsage(null);
          setEntitlement(null);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [pathname]);

  if (!VISIBLE_PATHS.has(pathname) || !usage || !entitlement || usage.limit <= 0) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, (usage.used / usage.limit) * 100));
  const nearLimit = usage.remaining <= Math.max(3, Math.ceil(usage.limit * 0.1));
  const isTrial = entitlement.subscription_status === "trialing";
  const trial = isTrial ? trialProgress(entitlement.trial_end) : null;

  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 70,
        width: "min(320px, calc(100vw - 28px))",
        padding: "13px 14px",
        border: isTrial ? "1px solid rgba(255,255,255,.24)" : "1px solid rgba(255,255,255,.14)",
        borderRadius: 14,
        background: "rgba(8,8,10,.94)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 12px 36px rgba(0,0,0,.35)",
        color: "#fff",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          {isTrial && (
            <span
              style={{
                display: "inline-block",
                marginBottom: 5,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".08em",
                opacity: 0.72,
              }}
            >
              FREE TRIAL · DAY {trial?.day ?? "—"} OF 7
            </span>
          )}
          <strong style={{ display: "block", fontSize: 13, letterSpacing: ".01em" }}>
            {usage.remaining.toLocaleString()} of {usage.limit.toLocaleString()} searches left
          </strong>
          <span style={{ display: "block", opacity: 0.58, marginTop: 2 }}>
            {isTrial
              ? `${trial?.remainingLabel ?? "7-day trial"} · ${planLabel(entitlement.plan)}`
              : `${usage.used.toLocaleString()} used · ${planLabel(entitlement.plan)} · rolling ${usage.periodDays} days`}
          </span>
          {isTrial && entitlement.cancel_at_period_end && (
            <span style={{ display: "block", opacity: 0.78, marginTop: 3 }}>
              Cancellation scheduled — access stays active until the trial ends.
            </span>
          )}
        </div>
        <Link
          href={isTrial ? "/pricing" : "/history"}
          style={{ color: "inherit", textDecoration: "none", fontWeight: 700, opacity: 0.86, whiteSpace: "nowrap" }}
        >
          {isTrial ? "Manage →" : "History →"}
        </Link>
      </div>
      <div
        aria-label={`${usage.used} of ${usage.limit} searches used`}
        style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,.10)", marginTop: 10, overflow: "hidden" }}
      >
        <div
          style={{
            width: `${percent}%`,
            minWidth: usage.used > 0 ? 4 : 0,
            height: "100%",
            borderRadius: 999,
            background: nearLimit ? "#fff" : "rgba(255,255,255,.72)",
            transition: "width .25s ease",
          }}
        />
      </div>
      {isTrial && usage.remaining <= 3 && (
        <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.35, opacity: 0.74 }}>
          Use the remaining searches carefully. A completed zero-result search still counts.
        </p>
      )}
    </div>
  );
}
