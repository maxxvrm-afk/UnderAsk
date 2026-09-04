import { NextResponse } from "next/server";
import { SEARCH_PLAN_RULES, type PlanId } from "@/lib/searchPlans";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXPIRES_AT = Date.parse("2026-09-04T08:25:00Z");
const MODEL = process.env.OPENAI_DEAL_MODEL || "gpt-5.6-luna";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const LIVE_SEARCH_URL = "https://underask-five.vercel.app/api/search/deals";

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

const cases: Array<{ plan: PlanId; selected: string[]; invalidLow?: string[]; invalidHigh?: string[] }> = [
  { plan: "scout", selected: ["marktplaats"], invalidLow: [], invalidHigh: ["marktplaats", "ebay"] },
  { plan: "pro", selected: ["marktplaats", "ebay"], invalidLow: [], invalidHigh: ["marktplaats", "ebay", "vinted"] },
  { plan: "multi-pro", selected: ["marktplaats", "ebay", "vinted"], invalidLow: [], invalidHigh: ["marktplaats", "ebay", "vinted", "catawiki"] },
  { plan: "business", selected: [] },
];

export async function GET() {
  if (Date.now() > EXPIRES_AT) {
    return NextResponse.json({ error: "E2E runner expired" }, { status: 410 });
  }

  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }

  const authGate = await fetch(LIVE_SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Nintendo Switch OLED", preferredSites: ["marktplaats"] }),
    cache: "no-store",
  });
  const authBody = await safeJson(authGate);

  const rights = cases.map((test) => {
    const rule = SEARCH_PLAN_RULES[test.plan];
    const valid = allowed(test.plan, test.selected);
    const low = test.invalidLow ? allowed(test.plan, test.invalidLow) : null;
    const high = test.invalidHigh ? allowed(test.plan, test.invalidHigh) : null;
    return {
      plan: test.plan,
      name: rule.name,
      min_sites: rule.minSites,
      max_sites: rule.maxSites,
      selected: test.selected,
      valid_selection_pass: valid,
      empty_selection_rejected: low === null ? null : !low,
      too_many_rejected: high === null ? null : !high,
      broad_without_selection: rule.broadWithoutSelection,
    };
  });

  const searchResults = [] as any[];
  for (const test of cases) {
    const rule = SEARCH_PLAN_RULES[test.plan];
    const labels = test.selected.map((s) => SITE_LABELS[s]);
    const preference = labels.length
      ? `Give extra search priority to these marketplaces: ${labels.join(", ")}. IMPORTANT: these are preferences, NOT an allowlist. Continue searching the broader public web for stronger listings and market evidence.`
      : "No marketplace preference is selected. Search broadly across the public web and use the strongest verifiable sources you can find.";

    const prompt = `UnderAsk E2E test. Search the live public web for one real second-hand Nintendo Switch OLED listing in Europe. ${preference} Return a concise answer with the listing title, public URL and source site. Do not invent a listing.`;

    const started = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        input: prompt,
        max_output_tokens: 500,
      }),
      cache: "no-store",
    });
    const body = await safeJson(response);
    const output = extractOutput(body);
    searchResults.push({
      plan: test.plan,
      expected_plan_name: rule.name,
      selected_sites: labels,
      broad_web_search: true,
      http_status: response.status,
      pass: response.ok && output.length > 0,
      elapsed_ms: Date.now() - started,
      output_preview: output.slice(0, 260),
      error: response.ok ? null : body?.error?.message || body?.error || null,
    });
  }

  const rightsPass = rights.every((r) =>
    r.valid_selection_pass === true &&
    (r.empty_selection_rejected === null || r.empty_selection_rejected === true) &&
    (r.too_many_rejected === null || r.too_many_rejected === true),
  );
  const searchesPass = searchResults.every((r) => r.pass === true);
  const authPass = authGate.status === 401;

  return NextResponse.json({
    ok: rightsPass && searchesPass && authPass,
    auth_gate: {
      expected_status: 401,
      actual_status: authGate.status,
      pass: authPass,
      error: authBody?.error || null,
    },
    rights,
    live_web_searches: searchResults,
    summary: {
      rights_pass: rightsPass,
      live_web_searches_pass: searchesPass,
      auth_gate_pass: authPass,
    },
  });
}

function allowed(plan: PlanId, selected: string[]) {
  const rule = SEARCH_PLAN_RULES[plan];
  const count = new Set(selected).size;
  if (count < rule.minSites) return false;
  if (rule.maxSites !== null && count > rule.maxSites) return false;
  return true;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractOutput(body: any) {
  if (typeof body?.output_text === "string") return body.output_text.trim();
  const parts: string[] = [];
  for (const item of body?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}
