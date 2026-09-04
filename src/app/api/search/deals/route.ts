import { NextRequest, NextResponse } from "next/server";
import { normalizePlan, SEARCH_PLAN_RULES } from "@/lib/searchPlans";
import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import { processDealCandidates } from "@/lib/dealQuality";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.OPENAI_DEAL_MODEL || "gpt-5.6-luna";

const SITE_LABELS: Record<string, string> = {
  marktplaats: "Marktplaats",
  ebay: "eBay",
  "2dehands": "2dehands",
  kleinanzeigen: "Kleinanzeigen",
  vinted: "Vinted",
  catawiki: "Catawiki",
  facebook: "Facebook Marketplace",
  autoscout24: "AutoScout24",
};

const CONDITION_LABELS: Record<string, string> = {
  any: "Any condition is acceptable if the economics are strong.",
  ready: "Prefer working, complete items that need no meaningful repair before resale. Exclude broken/parts-only projects.",
  cosmetic_ok: "Working items with cosmetic wear, scratches or easy detailing work are acceptable, but avoid meaningful mechanical/electronic repair projects.",
  repair_ok: "Repair projects and damaged items are acceptable when the likely repair cost is included conservatively and the margin still works.",
};

const DEAL_SCHEMA = {
  type: "object",
  properties: {
    deals: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          source: { type: "string" },
          ask_price: { type: "number" },
          estimated_fees: { type: "number" },
          estimated_shipping: { type: "number" },
          estimated_repair_cost: { type: "number" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          speed_to_sell: { type: "integer", minimum: 0, maximum: 100 },
          reasoning: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          comparables: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                source: { type: "string" },
                price: { type: "number" },
                kind: {
                  type: "string",
                  enum: ["sold", "asking", "market_reference"],
                },
              },
              required: ["title", "url", "source", "price", "kind"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "title",
          "url",
          "source",
          "ask_price",
          "estimated_fees",
          "estimated_shipping",
          "estimated_repair_cost",
          "confidence",
          "speed_to_sell",
          "reasoning",
          "risks",
          "comparables",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["deals"],
  additionalProperties: false,
} as const;

type SearchUsage = {
  allowed: boolean;
  searchId: string | null;
  plan: string;
  used: number;
  limit: number;
  remaining: number;
  reason: string | null;
};

class OpenAIError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Add OPENAI_API_KEY in Vercel to activate live search." },
      { status: 503 },
    );
  }

  let entitlement: Awaited<ReturnType<typeof getEntitlement>>;
  try {
    entitlement = await getEntitlement(req);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Could not verify your OWN THE WALL account." },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { error: "Enter what kind of deal you want." },
      { status: 400 },
    );
  }

  const planRule = SEARCH_PLAN_RULES[entitlement.plan];
  const preferredSites: string[] = Array.isArray(body?.preferredSites)
    ? [
        ...new Set<string>(
          body.preferredSites.filter(
            (site: unknown): site is string =>
              typeof site === "string" && Boolean(SITE_LABELS[site]),
          ),
        ),
      ]
    : [];

  if (preferredSites.length < planRule.minSites) {
    return NextResponse.json(
      {
        error: `${planRule.name} requires at least ${planRule.minSites} marketplace${planRule.minSites === 1 ? "" : "s"} to be selected.`,
      },
      { status: 400 },
    );
  }

  if (planRule.maxSites !== null && preferredSites.length > planRule.maxSites) {
    return NextResponse.json(
      {
        error: `${planRule.name} allows up to ${planRule.maxSites} selected marketplace${planRule.maxSites === 1 ? "" : "s"}.`,
      },
      { status: 400 },
    );
  }

  const minRoi = clampOptional(body?.minRoi, 0, 1000);
  const minScore = clampOptional(body?.minScore, 0, 100);
  const minProfit = clampOptional(body?.minProfit, 0, 1_000_000);
  const maxAskPrice = clampOptional(body?.maxAskPrice, 0, 1_000_000);
  const rawCondition = typeof body?.conditionPreference === "string" ? body.conditionPreference : "any";
  if (!CONDITION_LABELS[rawCondition]) {
    return NextResponse.json({ error: "Choose a valid condition preference." }, { status: 400 });
  }
  const conditionPreference = rawCondition;
  const preferredLabels = preferredSites.map((site) => SITE_LABELS[site]);

  let usage: SearchUsage;
  try {
    usage = await reserveSearch(
      req,
      query,
      preferredSites,
      minRoi,
      minScore,
      minProfit,
      maxAskPrice,
      conditionPreference,
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[UnderAsk deals] usage reservation failed", error);
    return NextResponse.json(
      { error: "UnderAsk could not verify your search allowance. Try again." },
      { status: 503 },
    );
  }

  if (!usage.allowed) {
    if (usage.reason === "subscription_required") {
      return NextResponse.json(
        { error: "An active UnderAsk subscription is required before searching." },
        { status: 402 },
      );
    }

    if (usage.reason === "site_selection_invalid") {
      return NextResponse.json(
        { error: "The selected marketplaces are not allowed for your current plan." },
        { status: 400 },
      );
    }

    if (usage.reason === "invalid_query") {
      return NextResponse.json({ error: "Enter a valid search request." }, { status: 400 });
    }

    if (usage.reason === "limit_reached") {
      return NextResponse.json(
        {
          error: `You've used all ${usage.limit} searches available in your current 30-day window. Upgrade your plan or wait for older searches to roll off.`,
          code: "SEARCH_LIMIT_REACHED",
          usage: usagePayload(usage),
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "This search could not be authorized." },
      { status: 403 },
    );
  }

  const preferenceText = preferredLabels.length
    ? `Give extra search priority to these marketplaces: ${preferredLabels.join(", ")}. IMPORTANT: these are preferences, NOT an allowlist. Continue searching the broader public web for stronger listings and comparable market evidence.`
    : "No marketplace preference is selected. Search broadly across the public web and use the strongest verifiable sources you can find.";

  const thresholdText = [
    minRoi !== null
      ? `Target deals likely to achieve at least ${minRoi}% server-calculated ROI.`
      : "",
    minScore !== null
      ? `Favor exceptionally strong opportunities because the final server deal-score threshold is ${minScore}/100.`
      : "",
    minProfit !== null
      ? `Target deals likely to produce at least €${minProfit} server-calculated NET profit after estimated fees, shipping and repair.`
      : "",
    maxAskPrice !== null
      ? `The candidate listing purchase/asking price must be no more than €${maxAskPrice}.`
      : "",
    `CONDITION PREFERENCE: ${CONDITION_LABELS[conditionPreference]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are UnderAsk, a conservative deal-finding engine.
Search the live public web for REAL second-hand or marketplace listings matching:
"${query}"

${preferenceText}
${thresholdText}

QUALITY STANDARD:
- Return at most 6 candidate deals. The server will independently validate, deduplicate and rank them, and expose at most 4.
- Every candidate MUST have a real DIRECT listing URL found during this live search. Never use a search page, category page, homepage or invented URL.
- For EACH candidate, find 2-4 UNIQUE public comparables for the same or genuinely equivalent item/model/version/condition.
- Every comparable MUST have its own real public URL and a numeric EUR price.
- Prefer sold/completed evidence whenever it is genuinely available. Label it kind=sold only when the source actually supports a sold/completed price. Otherwise use asking or market_reference honestly.
- Never reuse the candidate listing itself as a comparable.
- Do not return a candidate at all if you cannot find at least 2 defensible comparables.
- Do not invent listings, prices, URLs, sellers, sold status, condition, or evidence.
- Exclude uncertain, stale-looking or unverifiable candidates rather than guessing.
- Do NOT calculate expected sale value, quick-sale value, ROI, net profit, price gap or deal score. The server derives those from the comparables and costs.
- estimated_fees, estimated_shipping and estimated_repair_cost must be realistic estimates, or 0 when genuinely not applicable.
- confidence is confidence in the listing + comparable evidence, not excitement about the profit.
- speed_to_sell is a realistic 0-100 estimate.
- Keep reasoning and risks concise and specific.
- All numeric money values must be converted to EUR.
- If no candidate meets this evidence standard, return an empty deals array.`;

  try {
    const response = await openai(key, prompt);
    const text = outputText(response);
    if (!text) throw new Error("EMPTY_MODEL_OUTPUT");

    const parsed = JSON.parse(text);
    const qualityDeals = await processDealCandidates(
      Array.isArray(parsed?.deals) ? parsed.deals : [],
      4,
    );

    const deals = qualityDeals
      .filter((d: any) => minRoi === null || d.roi_percent >= minRoi)
      .filter((d: any) => minScore === null || d.deal_score >= minScore)
      .filter((d: any) => minProfit === null || d.net_profit >= minProfit)
      .filter((d: any) => maxAskPrice === null || d.ask_price <= maxAskPrice)
      .sort((a: any, b: any) => b.deal_score - a.deal_score);

    await finishSearch(req, usage.searchId, "completed", deals.length, null);

    return NextResponse.json({
      deals,
      meta: {
        model: MODEL,
        result_count: deals.length,
        scoring_version: "v2.1",
        quality_version: "comparables-v1",
        comparables_required: 2,
        listing_url_checks: true,
        duplicate_filtering: true,
        resale_value_source: "server-derived comparables",
        plan: planRule.name,
        subscription_status: entitlement.subscriptionStatus,
        min_roi: minRoi,
        min_score: minScore,
        min_profit: minProfit,
        max_ask_price: maxAskPrice,
        condition_preference: conditionPreference,
        preferred_sites: preferredLabels,
        broad_web_search: true,
        identity_source: "OWN THE WALL",
        usage: usagePayload(usage),
      },
    });
  } catch (e: any) {
    await finishSearch(
      req,
      usage.searchId,
      "failed",
      null,
      e instanceof OpenAIError ? e.code : String(e?.message || e?.name || "SEARCH_FAILED"),
    );

    console.error("[UnderAsk deals] search failed", {
      name: e?.name,
      message: e?.message,
      status: e?.status,
      code: e?.code,
    });

    if (e instanceof OpenAIError) {
      if (e.status === 429) {
        return NextResponse.json(
          {
            error:
              "Search capacity is busy right now. Please retry in about 30–60 seconds.",
            usage: usagePayload(usage),
          },
          { status: 429 },
        );
      }

      if (e.status === 401 || e.status === 403) {
        return NextResponse.json(
          {
            error:
              "UnderAsk's search connection is not configured correctly. Check the OpenAI API key and model access in Vercel.",
            usage: usagePayload(usage),
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "UnderAsk could not complete this search. Try again or use a slightly narrower request.",
        usage: usagePayload(usage),
      },
      { status: 500 },
    );
  }
}

function authToken(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
}

async function getEntitlement(req: NextRequest) {
  const token = authToken(req);

  if (!token) {
    throw new AuthError(401, "Sign in with your OWN THE WALL account first.");
  }

  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_entitlements?select=plan,subscription_status,current_period_end&limit=1`,
    {
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(401, "Your OWN THE WALL session expired. Sign in again.");
  }

  if (!response.ok) {
    throw new AuthError(503, "Could not load your UnderAsk plan from OWN THE WALL.");
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    throw new AuthError(402, "Choose an UnderAsk subscription before searching.");
  }

  const subscriptionStatus =
    typeof row?.subscription_status === "string"
      ? row.subscription_status
      : "inactive";

  if (
    subscriptionStatus !== "active" &&
    subscriptionStatus !== "trialing" &&
    subscriptionStatus !== "past_due"
  ) {
    throw new AuthError(
      402,
      "An active UnderAsk subscription is required before searching.",
    );
  }

  return {
    plan: normalizePlan(row?.plan),
    subscriptionStatus,
  };
}

async function reserveSearch(
  req: NextRequest,
  query: string,
  preferredSites: string[],
  minRoi: number | null,
  minScore: number | null,
  minProfit: number | null,
  maxAskPrice: number | null,
  conditionPreference: string,
): Promise<SearchUsage> {
  const token = authToken(req);
  if (!token) throw new AuthError(401, "Sign in with your OWN THE WALL account first.");

  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_reserve_search`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_query: query,
      p_preferred_sites: preferredSites,
      p_min_roi: minRoi,
      p_min_score: minScore,
      p_min_profit: minProfit,
      p_max_ask_price: maxAskPrice,
      p_condition_preference: conditionPreference,
    }),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(401, "Your OWN THE WALL session expired. Sign in again.");
  }
  if (!response.ok) throw new Error(`USAGE_RESERVE_${response.status}`);

  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("USAGE_RESERVE_EMPTY");

  return {
    allowed: Boolean(row.allowed),
    searchId: typeof row.search_id === "string" ? row.search_id : null,
    plan: typeof row.plan === "string" ? row.plan : "scout",
    used: Number(row.used) || 0,
    limit: Number(row.search_limit) || 0,
    remaining: Number(row.remaining) || 0,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

async function finishSearch(
  req: NextRequest,
  searchId: string | null,
  status: "completed" | "failed",
  resultCount: number | null,
  errorCode: string | null,
) {
  if (!searchId) return;
  const token = authToken(req);
  if (!token) return;

  try {
    const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_finish_search`, {
      method: "POST",
      headers: {
        apikey: OTW_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_search_id: searchId,
        p_status: status,
        p_result_count: resultCount,
        p_error_code: errorCode,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[UnderAsk deals] could not finish usage record", response.status);
    }
  } catch (error) {
    console.error("[UnderAsk deals] could not finish usage record", error);
  }
}

function usagePayload(usage: SearchUsage) {
  return {
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    period_days: 30,
  };
}

async function openai(key: string, prompt: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        input: prompt,
        max_output_tokens: 4200,
        text: {
          format: {
            type: "json_schema",
            name: "underask_deals",
            strict: true,
            schema: DEAL_SCHEMA,
          },
        },
      }),
      cache: "no-store",
    });

    if (r.ok) return r.json();

    const raw = await r.text();
    let detail: any = null;
    try {
      detail = JSON.parse(raw);
    } catch {
      detail = null;
    }

    const code =
      typeof detail?.error?.code === "string"
        ? detail.error.code
        : `HTTP_${r.status}`;
    const message =
      typeof detail?.error?.message === "string"
        ? detail.error.message
        : `OpenAI request failed with status ${r.status}`;

    if (r.status === 429 && attempt < 2) {
      const retryAfter = Number(r.headers.get("retry-after"));
      const fallbackMs = 1500 * Math.pow(2, attempt);
      const retryMs = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 7000)
        : Math.min(fallbackMs, 7000);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      continue;
    }

    throw new OpenAIError(r.status, code, message);
  }

  throw new OpenAIError(429, "RATE_LIMIT", "OpenAI rate limit reached");
}

function outputText(r: any) {
  if (typeof r?.output_text === "string" && r.output_text.trim()) {
    return r.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of r?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function clampOptional(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : null;
}
