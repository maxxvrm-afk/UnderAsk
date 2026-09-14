import { NextResponse } from "next/server";
import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";
import { processDealCandidates } from "@/lib/dealQuality";
import {
  CONDITION_LABELS,
  DEAL_SCHEMA,
  SITE_LABELS,
  UNDERASK_DEAL_MODEL,
} from "@/lib/underAskDealAiConfig";
import {
  OpenAIRequestError,
  outputText,
  runOpenAIDealRequest,
  type OpenAITelemetry,
} from "@/lib/openAiDealTelemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = UNDERASK_DEAL_MODEL;

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

  let telemetry: OpenAITelemetry | null = null;
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

    const prompt = `You are UnderAsk, a conservative deal-finding engine running a saved-search alert.
Search the live public web for REAL second-hand or marketplace listings matching:
"${job.query}"

${preferenceText}
${economics}
Prioritize unusually strong, newly discoverable listings because an alert should only fire for high-quality opportunities.

QUALITY STANDARD:
- Return at most 6 candidate deals; the server independently validates, deduplicates and ranks them.
- Every candidate MUST use a real DIRECT listing URL, never a search/category/home page.
- For every candidate, include 2-4 UNIQUE public comparables for the same or genuinely equivalent item/model/version/condition.
- Every comparable must have a real public URL and numeric EUR price.
- Prefer genuinely sold/completed evidence; use kind=sold only when the source actually supports that status. Otherwise label asking or market_reference honestly.
- Never reuse the candidate listing as a comparable.
- Do not return a candidate if fewer than 2 defensible comparables exist.
- Never invent URLs, prices, sellers, sold status, condition or evidence.
- Do NOT calculate expected sale value, quick-sale value, ROI, net profit, price gap or deal score; the server derives these from comparables and costs.
- estimated fees, shipping and repair costs must be realistic, or 0 when genuinely not applicable.
- confidence means confidence in evidence quality, not profit excitement.
- Numeric money values are EUR; speed_to_sell and confidence are 0-100 integers.
- If no candidate meets this evidence standard, return an empty deals array.`;

    const ai = await runOpenAIDealRequest({
      key,
      model: MODEL,
      prompt,
      schema: DEAL_SCHEMA,
      schemaName: "underask_alert_deals",
    });
    telemetry = ai.telemetry;
    await recordAlertTelemetry(job.job_token, telemetry);

    const text = outputText(ai.body);
    if (!text) throw new Error("EMPTY_MODEL_OUTPUT");

    const parsed = JSON.parse(text);
    const qualityDeals = await processDealCandidates(Array.isArray(parsed?.deals) ? parsed.deals : [], 4);
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
      telemetry_recorded: true,
    });
  } catch (error: any) {
    if (error instanceof OpenAIRequestError) telemetry = error.telemetry;
    if (telemetry) await recordAlertTelemetry(job.job_token, telemetry).catch(() => null);

    const message = error instanceof OpenAIRequestError
      ? error.code
      : String(error?.message || error?.code || "ALERT_SEARCH_FAILED").slice(0, 400);
    await finishJob(job.job_token, [], message).catch(() => null);
    console.error("[UnderAsk alerts] scheduled search failed", { message });
    return NextResponse.json({ error: "alert_search_failed" }, { status: 500 });
  }
}

async function claimJob(savedSearchId: string, ts: number, sig: string): Promise<AlertJob | null> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_get_alert_job`, {
    method: "POST",
    headers: { apikey: OTW_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ p_saved_search_id: savedSearchId, p_ts: ts, p_sig: sig }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALERT_JOB_${response.status}`);
  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;
  return row?.job_token ? row as AlertJob : null;
}

async function recordAlertTelemetry(jobToken: string, t: OpenAITelemetry) {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_record_alert_ai_telemetry`, {
    method: "POST",
    headers: { apikey: OTW_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      p_job_token: jobToken,
      p_model: MODEL,
      p_openai_request_id: t.requestId,
      p_input_tokens: t.inputTokens,
      p_output_tokens: t.outputTokens,
      p_remaining_requests: t.remainingRequests,
      p_remaining_tokens: t.remainingTokens,
      p_reset_requests: t.resetRequests,
      p_reset_tokens: t.resetTokens,
      p_rate_limit_hits: t.rateLimitHits,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALERT_TELEMETRY_${response.status}`);
}

async function finishJob(jobToken: string, deals: any[], error: string | null) {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_finish_alert_job`, {
    method: "POST",
    headers: { apikey: OTW_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ p_job_token: jobToken, p_results: deals, p_error: error }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALERT_FINISH_${response.status}`);
  const data = await response.json();
  return Number(data) || 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
