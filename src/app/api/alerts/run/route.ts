import { NextResponse } from "next/server";
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
  ready: "Prefer working, complete items that need no meaningful repair before resale. Exclude broken or parts-only projects.",
  cosmetic_ok: "Working items with cosmetic wear or easy detailing work are acceptable, but avoid meaningful repair projects.",
  repair_ok: "Repair projects and damaged items are acceptable when likely repair cost is included conservatively and the margin still works.",
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

type AlertJob = {
  job_token: string;
  query: string;
  preferred_sites: string[];
  min_roi: number | null;
  min_score: number | null;
  min_profit: number | null;
  max_ask_price: number | null;
  condition_preference: string | null;
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
    const minProfit = optionalNumber(job.min_profit);
    const maxAskPrice = optionalNumber(job.max_ask_price);
    const conditionPreference = CONDITION_LABELS[job.condition_preference || ""]
      ? String(job.condition_preference)
      : "any";
    const alertMinScore = Math.max(70, optionalNumber(job.alert_min_score) ?? 70);

    const preferenceText = preferredLabels.length
      ? `Give extra search priority to these marketplaces: ${preferredLabels.join(", ")}. IMPORTANT: these are preferences, NOT an allowlist. Continue searching the broader public web for stronger listings and comparable evidence.`
      : "No marketplace preference is selected. Search broadly across the public web.";

    const economics = [
      minRoi !== null ? `Target at least ${minRoi}% server-calculated ROI.` : "",
      minProfit !== null ? `Target at least €${minProfit} server-calculated NET profit after estimated fees, shipping and repair.` : "",
      maxAskPrice !== null ? `Candidate asking price must be no more than €${maxAskPrice}.` : "",
      `CONDITION PREFERENCE: ${CONDITION_LABELS[conditionPreference]}`,
    ].filter(Boolean).join("\n");

    const prompt = `You are UnderAsk, a conservative deal-finding engine running a saved-search alert.\nSearch the live public web for REAL second-hand or marketplace listings matching:\n"${job.query}"\n\n${preferenceText}\n${economics}\nPrioritize unusually strong, newly discoverable listings because an alert should only fire for high-quality opportunities.\n\nQUALITY STANDARD:\n- Return at most 6 candidate deals; the server independently validates, deduplicates and ranks them.\n- Every candidate MUST use a real DIRECT listing URL, never a search/category/home page.\n- For every candidate, include 2-4 UNIQUE public comparables for the same or genuinely equivalent item/model/version/condition.\n- Every comparable must have a real public URL and numeric EUR price.\n- Prefer genuinely sold/completed evidence; use kind=sold only when the source actually supports that status. Otherwise label asking or market_reference honestly.\n- Never reuse the candidate listing as a comparable.\n- Do not return a candidate if fewer than 2 defensible comparables exist.\n- Never invent URLs, prices, sellers, sold status, condition or evidence.\n- Do NOT calculate expected sale value, quick-sale value, ROI, net profit, price gap or deal score; the server derives these from the comparables and costs.\n- estimated fees, shipping and repair costs must be realistic, or 0 when genuinely not applicable.\n- confidence means confidence in evidence quality, not profit excitement.\n- Numeric money values are EUR; speed_to_sell and confidence are 0-100 integers.\n- If no candidate meets this evidence standard, return an empty deals array.`;

    const response = await openai(key, prompt);
    const text = outputText(response);
    if (!text) throw new Error("EMPTY_MODEL_OUTPUT");

    const parsed = JSON.parse(text);
    const qualityDeals = await processDealCandidates(
      Array.isArray(parsed?.deals) ? parsed.deals : [],
      4,
    );

    const deals = qualityDeals
      .filter((deal: any) => minRoi === null || deal.roi_percent >= minRoi)
      .filter((deal: any) => minProfit === null || deal.net_profit >= minProfit)
      .filter((deal: any) => maxAskPrice === null || deal.ask_price <= maxAskPrice)
      .filter((deal: any) => deal.deal_score >= alertMinScore)
      .sort((a: any, b: any) => b.deal_score - a.deal_score);

    const inserted = await finishJob(job.job_token, deals, null);
    return NextResponse.json({
      ok: true,
      found: deals.length,
      new_alerts: inserted,
      quality_version: "comparables-v1",
      reseller_filters: true,
    });
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
        max_output_tokens: 4200,
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
