import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXPIRES_AT = Date.parse("2026-09-04T08:25:00Z");
const MODEL = process.env.OPENAI_DEAL_MODEL || "gpt-5.6-luna";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const cases = [
  {
    plan: "scout",
    selectedSites: ["Marktplaats"],
    preference:
      "Give extra search priority to Marktplaats. IMPORTANT: this is a preference, NOT an allowlist. Continue searching the broader public web for stronger listings and market evidence.",
  },
  {
    plan: "business",
    selectedSites: [],
    preference:
      "No marketplace preference is selected. Search broadly across the public web and use the strongest verifiable sources you can find.",
  },
];

export async function GET() {
  if (Date.now() > EXPIRES_AT) {
    return NextResponse.json({ error: "E2E runner expired" }, { status: 410 });
  }
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }

  const results = [] as any[];
  for (const test of cases) {
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
        input: `UnderAsk E2E retest for ${test.plan}. Search the live public web for one real second-hand Nintendo Switch OLED listing in Europe. ${test.preference} Return only a short listing title, public URL, source site and asking price. Do not invent anything.`,
        max_output_tokens: 1000,
      }),
      cache: "no-store",
    });

    const body = await safeJson(response);
    const output = extractOutput(body);
    const outputTypes = Array.isArray(body?.output)
      ? body.output.map((item: any) => item?.type).filter(Boolean)
      : [];
    const hasWebSearchCall = outputTypes.includes("web_search_call");
    const completed = body?.status === "completed" || body?.status === undefined;

    results.push({
      plan: test.plan,
      selected_sites: test.selectedSites,
      broad_web_search: true,
      http_status: response.status,
      response_status: body?.status ?? null,
      output_types: outputTypes,
      has_web_search_call: hasWebSearchCall,
      pass: response.ok && hasWebSearchCall && completed && output.length > 0,
      elapsed_ms: Date.now() - started,
      output_preview: output.slice(0, 320),
      incomplete_details: body?.incomplete_details ?? null,
      error: response.ok ? null : body?.error?.message || body?.error || null,
    });
  }

  return NextResponse.json({
    ok: results.every((r) => r.pass),
    results,
  });
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
