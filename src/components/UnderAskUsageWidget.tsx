"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import { fetchUnderAskUsage, type UnderAskUsage } from "@/lib/underAskUsage";

const VISIBLE_PATHS = new Set(["/search", "/results", "/history"]);

export default function UnderAskUsageWidget() {
  const pathname = usePathname();
  const [usage, setUsage] = useState<UnderAskUsage | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!VISIBLE_PATHS.has(pathname)) {
        if (active) setUsage(null);
        return;
      }

      try {
        const session = await getValidOwnTheWallSession();
        if (!session) return;
        const nextUsage = await fetchUnderAskUsage(session.access_token);
        if (active) setUsage(nextUsage);
      } catch {
        if (active) setUsage(null);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [pathname]);

  if (!VISIBLE_PATHS.has(pathname) || !usage || usage.limit <= 0) return null;

  const percent = Math.min(100, Math.max(0, (usage.used / usage.limit) * 100));
  const nearLimit = usage.remaining <= Math.max(5, Math.ceil(usage.limit * 0.1));

  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 70,
        width: "min(290px, calc(100vw - 28px))",
        padding: "12px 14px",
        border: "1px solid rgba(255,255,255,.14)",
        borderRadius: 14,
        background: "rgba(8,8,10,.92)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 12px 36px rgba(0,0,0,.35)",
        color: "#fff",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <strong style={{ display: "block", fontSize: 12, letterSpacing: ".02em" }}>
            {usage.remaining.toLocaleString()} searches left
          </strong>
          <span style={{ opacity: 0.58 }}>
            {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} used · rolling {usage.periodDays} days
          </span>
        </div>
        <Link
          href="/history"
          style={{ color: "inherit", textDecoration: "none", fontWeight: 700, opacity: 0.82 }}
        >
          History →
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
    </div>
  );
}
