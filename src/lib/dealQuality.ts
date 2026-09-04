export type ComparableKind = "sold" | "asking" | "market_reference";

export type DealComparable = {
  title: string;
  url: string;
  source: string;
  price: number;
  kind: ComparableKind;
};

type ListingCheck = "reachable" | "unverified" | "dead";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function median(values: number[]) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        lower === "fbclid" ||
        lower === "gclid" ||
        lower === "igshid" ||
        lower === "mc_cid" ||
        lower === "mc_eid"
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

function canonicalUrlKey(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${url.pathname.toLowerCase()}${url.search}`;
  } catch {
    return value.toLowerCase();
  }
}

function looksLikeGenericPage(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    if (path === "/" || path === "") return true;

    const genericPatterns = [
      /(^|\/)search(\/|$)/,
      /(^|\/)zoeken(\/|$)/,
      /(^|\/)browse(\/|$)/,
      /(^|\/)category(\/|$)/,
      /(^|\/)categories(\/|$)/,
      /(^|\/)catalog(\/|$)/,
      /(^|\/)results(\/|$)/,
    ];

    return genericPatterns.some((pattern) => pattern.test(path));
  } catch {
    return true;
  }
}

function normalizedTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9à-ž]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleSimilarity(a: string, b: string) {
  const left = new Set(normalizedTitle(a).split(" ").filter((word) => word.length > 1));
  const right = new Set(normalizedTitle(b).split(" ").filter((word) => word.length > 1));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection++;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function comparableKind(value: unknown): ComparableKind | null {
  return value === "sold" || value === "asking" || value === "market_reference"
    ? value
    : null;
}

function normalizeComparables(value: unknown, listingUrl: string) {
  if (!Array.isArray(value)) return [];

  const listingKey = canonicalUrlKey(listingUrl);
  const seen = new Set<string>();
  const result: DealComparable[] = [];

  for (const raw of value) {
    const url = normalizeUrl(raw?.url);
    const price = number(raw?.price);
    const kind = comparableKind(raw?.kind);
    const title = text(raw?.title);
    const source = text(raw?.source) || "Web";

    if (!url || !title || !kind || price <= 0 || looksLikeGenericPage(url)) continue;
    const key = canonicalUrlKey(url);
    if (key === listingKey || seen.has(key)) continue;
    seen.add(key);
    result.push({ title, url, source, price: round2(price), kind });
    if (result.length >= 4) break;
  }

  return result;
}

function marketValueFromComparables(comparables: DealComparable[]) {
  const sold = comparables.filter((item) => item.kind === "sold");
  if (sold.length >= 2) return median(sold.map((item) => item.price));

  return median(
    comparables.map((item) => {
      if (item.kind === "sold") return item.price;
      if (item.kind === "asking") return item.price * 0.9;
      return item.price * 0.92;
    }),
  );
}

async function checkListing(url: string): Promise<ListingCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; UnderAskListingCheck/1.0; +https://underask-five.vercel.app)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
      },
    });

    try {
      await response.body?.cancel();
    } catch {
      // Response body cancellation is best-effort only.
    }

    if (response.status === 404 || response.status === 410) return "dead";
    if (response.status >= 200 && response.status < 400) return "reachable";
    return "unverified";
  } catch {
    return "unverified";
  } finally {
    clearTimeout(timer);
  }
}

function evidenceFrom(comparables: DealComparable[], listingCheck: ListingCheck) {
  const listingEvidence =
    listingCheck === "reachable"
      ? "Listing URL responded successfully during this search."
      : "Marketplace blocked or did not answer the independent URL check; listing evidence still came from live web search.";

  const compEvidence = comparables.slice(0, 2).map((item) => {
    const label = item.kind === "sold" ? "sold" : item.kind === "asking" ? "asking" : "market";
    return `${label} comparable: €${round2(item.price)} — ${item.title} (${item.source})`;
  });

  return [listingEvidence, ...compEvidence].slice(0, 3);
}

function buildDeal(raw: any, listingCheck: ListingCheck) {
  const title = text(raw?.title);
  const url = normalizeUrl(raw?.url);
  const source = text(raw?.source) || "Web";
  const ask = number(raw?.ask_price);

  if (!title || !url || ask <= 0 || looksLikeGenericPage(url) || listingCheck === "dead") {
    return null;
  }

  const comparables = normalizeComparables(raw?.comparables, url);
  if (comparables.length < 2) return null;

  const expected = marketValueFromComparables(comparables);
  if (expected <= 0) return null;

  const quick = expected * 0.88;
  const fees = Math.max(0, number(raw?.estimated_fees));
  const shipping = Math.max(0, number(raw?.estimated_shipping));
  const repair = Math.max(0, number(raw?.estimated_repair_cost));
  const speed = clamp(number(raw?.speed_to_sell), 0, 100);

  const soldCount = comparables.filter((item) => item.kind === "sold").length;
  const comparableCap = comparables.length >= 4 ? 94 : comparables.length === 3 ? 88 : 78;
  const soldBonus = soldCount >= 2 ? 4 : soldCount === 1 ? 2 : 0;
  const reachabilityCap = listingCheck === "reachable" ? 100 : 70;
  const confidence = Math.round(
    Math.min(
      clamp(number(raw?.confidence), 0, 100),
      comparableCap + soldBonus,
      reachabilityCap,
    ),
  );

  const investment = ask + fees + shipping + repair;
  const profit = expected - investment;
  const roi = investment > 0 ? (profit / investment) * 100 : 0;
  const gap = expected > 0 ? ((expected - ask) / expected) * 100 : 0;
  const dealScore =
    100 *
    (0.38 * clamp(roi / 60, 0, 1) +
      0.22 * clamp(gap / 45, 0, 1) +
      0.25 * (confidence / 100) +
      0.15 * (speed / 100));

  return {
    title,
    url,
    source,
    ask_price: round2(ask),
    expected_sale_price: round2(expected),
    quick_sale_price: round2(quick),
    estimated_fees: round2(fees),
    estimated_shipping: round2(shipping),
    estimated_repair_cost: round2(repair),
    net_profit: round2(profit),
    roi_percent: round2(roi),
    confidence,
    speed_to_sell: Math.round(speed),
    price_gap_percent: round2(gap),
    deal_score: round2(clamp(dealScore, 0, 100)),
    reasoning: text(raw?.reasoning),
    risks: Array.isArray(raw?.risks)
      ? raw.risks.map(text).filter(Boolean).slice(0, 3)
      : [],
    evidence: evidenceFrom(comparables, listingCheck),
    comparables,
    listing_check: listingCheck,
  };
}

function isNearDuplicate(a: any, b: any) {
  if (canonicalUrlKey(a.url) === canonicalUrlKey(b.url)) return true;
  const priceDelta = Math.abs(a.ask_price - b.ask_price) / Math.max(a.ask_price, b.ask_price, 1);
  return priceDelta <= 0.02 && titleSimilarity(a.title, b.title) >= 0.88;
}

export async function processDealCandidates(candidates: unknown[], maxResults = 4) {
  const rawCandidates = Array.isArray(candidates) ? candidates.slice(0, 8) : [];
  const listingUrls = rawCandidates.map((candidate: any) => normalizeUrl(candidate?.url));

  const checks = await Promise.all(
    listingUrls.map((url) => (url ? checkListing(url) : Promise.resolve<ListingCheck>("dead"))),
  );

  const scored = rawCandidates
    .map((candidate, index) => buildDeal(candidate, checks[index]))
    .filter(Boolean)
    .filter((deal: any) => deal.net_profit > 0 && deal.roi_percent > 0)
    .sort((a: any, b: any) => b.deal_score - a.deal_score);

  const unique: any[] = [];
  for (const deal of scored) {
    if (unique.some((existing) => isNearDuplicate(existing, deal))) continue;
    unique.push(deal);
    if (unique.length >= maxResults) break;
  }

  return unique;
}
