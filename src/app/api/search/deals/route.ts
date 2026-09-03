import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.OPENAI_DEAL_MODEL || "gpt-5.6-luna";

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

class OpenAIError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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

  const prompt = `You are UnderAsk, a deal-finding engine.
Search the live public web for REAL second-hand or marketplace listings matching:
"${query}"

Find public market evidence/comparables to estimate resale value.

RULES:
- Return at most 4 strong deals.
- Every result MUST have a real public listing URL found during this search.
- Prefer direct listing URLs over search/category pages.
- Do not invent listings, prices, URLs, sellers, or evidence.
- Exclude uncertain or unverifiable results.
- expected_sale_price = realistic achievable resale, never the highest asking price.
- quick_sale_price = conservative fast-sale value.
- estimated_fees, estimated_shipping and estimated_repair_cost must be realistic estimates, or 0 when genuinely not applicable.
- Do NOT calculate ROI, net profit, price gap or deal score. The server calculates those.
- Keep reasoning and evidence concise.
- Numeric money values in EUR.
- confidence and speed_to_sell are 0-100 integers.
- If no verifiable deal is good enough, return an empty deals array.`;

  try {
    const response = await openai(key, prompt);
    const text = outputText(response);

    if (!text) {
      throw new Error("EMPTY_MODEL_OUTPUT");
    }

    const parsed = JSON.parse(text);
    const deals = (Array.isArray(parsed?.deals) ? parsed.deals : [])
      .slice(0, 4)
      .map(score)
      .filter(Boolean)
      .filter((d: any) => d.net_profit > 0 && d.roi_percent > 0)
      .sort((a: any, b: any) => b.deal_score - a.deal_score);

    return NextResponse.json({
      deals,
      meta: {
        model: MODEL,
        result_count: deals.length,
        scoring_version: "v1.2",
      },
    });
  } catch (e: any) {
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
          },
          { status: 429 },
        );
      }

      if (e.status === 401 || e.status === 403) {
        return NextResponse.json(
          {
            error:
              "UnderAsk's search connection is not configured correctly. Check the OpenAI API key and model access in Vercel.",
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "UnderAsk could not complete this search. Try again or use a slightly narrower request.",
      },
      { status: 500 },
    );
  }
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
        max_output_tokens: 2600,
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

    if (r.ok) {
      return r.json();
    }

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
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function arr(v: any) {
  return Array.isArray(v) ? v.map(s).filter(Boolean) : [];
}

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function r2(x: number) {
  return Math.round(x * 100) / 100;
}

function score(d: any) {
  const title = s(d.title);
  const url = s(d.url);
  const source = s(d.source) || "Web";
  const ask = n(d.ask_price);
  const expected = n(d.expected_sale_price);
  const quick = n(d.quick_sale_price);
  const fees = Math.max(0, n(d.estimated_fees));
  const shipping = Math.max(0, n(d.estimated_shipping));
  const repair = Math.max(0, n(d.estimated_repair_cost));
  const confidence = clamp(n(d.confidence), 0, 100);
  const speed = clamp(n(d.speed_to_sell), 0, 100);

  if (
    !title ||
    !/^https?:\/\//i.test(url) ||
    ask <= 0 ||
    expected <= 0 ||
    quick <= 0
  ) {
    return null;
  }

  const investment = ask + fees + shipping + repair;
  const profit = expected - investment;
  const roi = investment > 0 ? (profit / investment) * 100 : 0;
  const gap = expected > 0 ? ((expected - ask) / expected) * 100 : 0;
  const total =
    100 *
    (0.38 * clamp(roi / 60, 0, 1) +
      0.22 * clamp(gap / 45, 0, 1) +
      0.25 * (confidence / 100) +
      0.15 * (speed / 100));

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
    reasoning: s(d.reasoning),
    risks: arr(d.risks).slice(0, 3),
    evidence: arr(d.evidence).slice(0, 3),
  };
}
