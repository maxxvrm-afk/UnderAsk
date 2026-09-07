"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";

const LINKS = [
  { href: "/search", label: "Search" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/feed", label: "Wins" },
  { href: "/scoreboard", label: "Scoreboard" },
];

export default function UnderAskMobileNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    getValidOwnTheWallSession()
      .then((session) => {
        if (mounted) setSignedIn(Boolean(session));
      })
      .catch(() => {
        if (mounted) setSignedIn(false);
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  if (!signedIn) return null;

  return (
    <nav className="mobileAppNav" aria-label="UnderAsk mobile navigation">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <a
            key={link.href}
            href={link.href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
