import { NextResponse } from "next/server";
import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

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

const DEAL_SCHEMA = {
  type: "object",
  properties: {
    deals: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          source: { type: "string" },
          ask_price: { type: "number" },
          expected_sale_price: { type: "number" },
          quick_sale_price: { type: "number" },
          estimated_fees: { type: "number" },
          estimated_shipping: { type: "number" },
          estimated_repair_cost: { type: "number" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          speed_to_sell: { type: "integer", minimum: 0, maximum: 100 },
          reasoning: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: [
          "title",
          "url",
          "source",
          "ask_price",
          "expected_sale_price",
          "quick_sale_price",
          "estimated_fees",
          "estimated_shipping",
          "estimated_repair_cost",
          "confidence",
          "speed_to_sell",
          "reasoning",
          "risks",
          "evidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["deals"],
  additionalProperties: false,
} as const;

type AlertJob = {
  job_token: string;
  query: string;
  preferred_sites: string[];
  min_roi: number | null;
  min_score: number | null;
  alert_min_score: number;
  plan: string;
};

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "search_not_configured" }, { status: 503 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const savedSearchId = typeof body?.saved_search_id === "string" ? body.saved_search_id : "";
  const ts = Number(body?.ts);
  const sig = typeof body?.sig === "string" ? body.sig : "";

  if (!/^[0-9a-f-]{36}$/i.test(savedSearchId) || !Number.isFinite(ts) || !sig) {
    return NextResponse.json({ error: "invalid_job" }, { status: 400 });
  }

  const job = await claimJob(savedSearchId, Math.trunc(ts), sig);
  if (!job) return new Response(null, { status: 204 });

  try {
    const preferredSites = Array.isArray(job.preferred_sites) ? job.preferred_sites : [];
    const preferredLabels = preferredSites.map((site) => SITE_LABELS[site] || site);
    const minRoi = optionalNumber(job.min_roi);
    const alertMinScore = Math.max(70, optionalNumber(job.alert_min_score) ?? 70);

    const preferenceText = preferredLabels.length
      ? `Give extra search priority to these marketplaces: ${preferredLabels.join(", ")}. IMPORTANT: these are preferences, NOT an allowlist. Continue searching the broader public web for stronger listings and comparables.`
      : "No marketplace preference is selected. Search broadly across the public web.";

    const prompt = `You are UnderAsk, a deal-finding engine running a saved-search alert.\nSearch the live public web for REAL second-hand or marketplace listings matching:\n"${job.query}"\n\n${preferenceText}\n${minRoi !== null ? `Target deals likely to achieve at least ${minRoi}% server-calculated ROI.` : ""}\nPrioritize unusually strong, newly discoverable listings because an alert should only fire for high-quality opportunities.\n\nRULES:\n- Return at most 4 strong deals.\n- Every result MUST have a real public listing URL found during this search.\n- Prefer direct listing URLs over search/category pages.\n- Do not invent listings, prices, URLs, sellers, or evidence.\n- expected_sale_price = realistic achievable resale.\n- quick_sale_price = conservative fast-sale value.\n- estimated fees, shipping and repair cost must be realistic, or 0 when genuinely not applicable.\n- Do NOT calculate ROI, net profit, price gap or deal score. The server calculates those.\n- Numeric money values in EUR.\n- confidence and speed_to_sell are 0-100 integers.\n- If no verifiable deal is strong enough, return an empty deals array.`;

    const response = await openai(key, prompt);
    const text = outputText(response);
    if (!text) throw new Error("EMPTY_MODEL_OUTPUT");

    const parsed = JSON.parse(text);
    const deals = (Array.isArray(parsed?.deals) ? parsed.deals : [])
      .slice(0, 4)
      .map(score)
      .filter(Boolean)
      .filter((deal: any) => deal.net_profit > 0 && deal.roi_percent > 0)
      .filter((deal: any) => minRoi === null || deal.roi_percent >= minRoi)
      .filter((deal: any) => deal.deal_score >= alertMinScore)
      .sort((a: any, b: any) => b.deal_score - a.deal_score);

    const inserted = await finishJob(job.job_token, deals, null);
    return NextResponse.json({ ok: true, found: deals.length, new_alerts: inserted });
  } catch (error: any) {
    const message = String(error?.message || error?.code || "ALERT_SEARCH_FAILED").slice(0, 400);
    await finishJob(job.job_token, [], message).catch(() => null);
    console.error("[UnderAsk alerts] scheduled search failed", { message });
    return NextResponse.json({ error: "alert_search_failed" }, { status: 500 });
  }
}

async function claimJob(savedSearchId: string, ts: number, sig: string): Promise<AlertJob | null> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_get_alert_job`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_saved_search_id: savedSearchId,
      p_ts: ts,
      p_sig: sig,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`ALERT_JOB_${response.status}`);
  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;
  return row?.job_token ? row as AlertJob : null;
}

async function finishJob(jobToken: string, deals: any[], error: string | null) {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_finish_alert_job`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_job_token: jobToken,
      p_results: deals,
      p_error: error,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`ALERT_FINISH_${response.status}`);
  const data = await response.json();
  return Number(data) || 0;
}

async function openai(key: string, prompt: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.openai.com/v1/responses", {
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
        max_output_tokens: 2600,
        text: {
          format: {
            type: "json_schema",
            name: "underask_alert_deals",
            strict: true,
            schema: DEAL_SCHEMA,
          },
        },
      }),
      cache: "no-store",
    });

    if (response.ok) return response.json();
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * Math.pow(2, attempt)));
      continue;
    }
    throw new Error(`OPENAI_${response.status}`);
  }
  throw new Error("OPENAI_RATE_LIMIT");
}

function outputText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function n(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function s(value: any) {
  return typeof value === "string" ? value.trim() : "";
}

function arr(value: any) {
  return Array.isArray(value) ? value.map(s).filter(Boolean) : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function r2(value: number) {
  return Math.round(value * 100) / 100;
}

function score(deal: any) {
  const title = s(deal.title);
  const url = s(deal.url);
  const source = s(deal.source) || "Web";
  const ask = n(deal.ask_price);
  const expected = n(deal.expected_sale_price);
  const quick = n(deal.quick_sale_price);
  const fees = Math.max(0, n(deal.estimated_fees));
  const shipping = Math.max(0, n(deal.estimated_shipping));
  const repair = Math.max(0, n(deal.estimated_repair_cost));
  const confidence = clamp(n(deal.confidence), 0, 100);
  const speed = clamp(n(deal.speed_to_sell), 0, 100);

  if (!title || !/^https?:\/\//i.test(url) || ask <= 0 || expected <= 0 || quick <= 0) return null;

  const investment = ask + fees + shipping + repair;
  const profit = expected - investment;
  const roi = investment > 0 ? (profit / investment) * 100 : 0;
  const gap = expected > 0 ? ((expected - ask) / expected) * 100 : 0;
  const total = 100 * (
    0.38 * clamp(roi / 60, 0, 1) +
    0.22 * clamp(gap / 45, 0, 1) +
    0.25 * (confidence / 100) +
    0.15 * (speed / 100)
  );

  return {
    title,
    url,
    source,
    ask_price: r2(ask),
    expected_sale_price: r2(expected),
    quick_sale_price: r2(quick),
    estimated_fees: r2(fees),
    estimated_shipping: r2(shipping),
    estimated_repair_cost: r2(repair),
    net_profit: r2(profit),
    roi_percent: r2(roi),
    confidence: Math.round(confidence),
    speed_to_sell: Math.round(speed),
    price_gap_percent: r2(gap),
    deal_score: r2(clamp(total, 0, 100)),
    reasoning: s(deal.reasoning),
    risks: arr(deal.risks).slice(0, 3),
    evidence: arr(deal.evidence).slice(0, 3),
  };
}
