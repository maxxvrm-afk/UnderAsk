"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/search", label: "Search" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/feed", label: "Wins" },
  { href: "/scoreboard", label: "Scoreboard" },
];

export default function UnderAskMobileNav() {
  const pathname = usePathname();

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
