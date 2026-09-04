import { NextRequest, NextResponse } from "next/server";
import { POST as searchDeals } from "@/app/api/search/deals/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALL_SITES = [
  "marktplaats",
  "ebay",
  "2dehands",
  "kleinanzeigen",
  "vinted",
  "catawiki",
  "facebook",
  "autoscout24",
];

type Plan = "scout" | "pro" | "multi-pro" | "business";

export async function GET() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let currentPlan: Plan = "scout";
  let currentStatus = "active";
  let lastPrompt = "";

  process.env.OPENAI_API_KEY = "underask-e2e-test-key";

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/rest/v1/underask_entitlements?")) {
      return new Response(
        JSON.stringify([
          {
            plan: currentPlan,
            subscription_status: currentStatus,
            current_period_end: null,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url === "https://api.openai.com/v1/responses") {
      const raw = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(raw);
      lastPrompt = typeof body?.input === "string" ? body.input : "";

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            deals: [
              {
                title: "E2E mock marketplace deal",
                url: "https://example.com/listing/underask-e2e",
                source: "E2E Mock Marketplace",
                ask_price: 100,
                expected_sale_price: 180,
                quick_sale_price: 150,
                estimated_fees: 0,
                estimated_shipping: 0,
                estimated_repair_cost: 0,
                confidence: 90,
                speed_to_sell: 90,
                reasoning: "Strong test opportunity.",
                risks: ["Test-only result"],
                evidence: ["Test-only market evidence"],
              },
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return originalFetch(input, init);
  };

  try {
    const results: Array<Record<string, unknown>> = [];

    async function run(
      name: string,
      plan: Plan,
      preferredSites: string[],
      expectedStatus: number,
      extra: Record<string, unknown> = {},
    ) {
      currentPlan = plan;
      currentStatus = "active";
      lastPrompt = "";

      const req = new NextRequest("https://underask-e2e.invalid/api/search/deals", {
        method: "POST",
        headers: {
          Authorization: "Bearer e2e-test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "used Bowers & Wilkins speakers second hand",
          preferredSites,
          ...extra,
        }),
      });

      const response = await searchDeals(req);
      const body = await response.json();
      const selectedLabels = Array.isArray(body?.meta?.preferred_sites)
        ? body.meta.preferred_sites
        : [];

      const promptBroad = preferredSites.length
        ? lastPrompt.includes("NOT an allowlist") && lastPrompt.includes("broader public web")
        : lastPrompt.includes("Search broadly across the public web");

      const pass =
        response.status === expectedStatus &&
        (expectedStatus !== 200 ||
          (body?.meta?.broad_web_search === true &&
            selectedLabels.length === preferredSites.length &&
            promptBroad));

      results.push({
        name,
        plan,
        selected_sites: preferredSites.length,
        expected_status: expectedStatus,
        actual_status: response.status,
        broad_web_search: body?.meta?.broad_web_search ?? null,
        preferred_sites_returned: selectedLabels.length,
        prompt_keeps_broad_search: expectedStatus === 200 ? promptBroad : null,
        result_count: body?.meta?.result_count ?? null,
        error: body?.error ?? null,
        pass,
      });
    }

    await run("Scout rejects zero sites", "scout", [], 400);
    await run("Scout accepts exactly one site", "scout", ["marktplaats"], 200);
    await run("Scout rejects two sites", "scout", ["marktplaats", "ebay"], 400);

    await run("Pro rejects zero sites", "pro", [], 400);
    await run("Pro accepts two sites", "pro", ["marktplaats", "ebay"], 200);
    await run("Pro rejects three sites", "pro", ["marktplaats", "ebay", "vinted"], 400);

    await run("Multi Pro rejects zero sites", "multi-pro", [], 400);
    await run("Multi Pro accepts three sites", "multi-pro", ["marktplaats", "ebay", "vinted"], 200);
    await run("Multi Pro rejects four sites", "multi-pro", ["marktplaats", "ebay", "vinted", "catawiki"], 400);

    await run("Business accepts no site selection", "business", [], 200);
    await run("Business accepts all supported sites", "business", ALL_SITES, 200);

    currentPlan = "scout";
    currentStatus = "inactive";
    const inactiveRequest = new NextRequest("https://underask-e2e.invalid/api/search/deals", {
      method: "POST",
      headers: {
        Authorization: "Bearer e2e-test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "inactive subscription test", preferredSites: ["marktplaats"] }),
    });
    const inactiveResponse = await searchDeals(inactiveRequest);
    const inactiveBody = await inactiveResponse.json();
    results.push({
      name: "Inactive subscription is blocked",
      plan: "scout",
      expected_status: 402,
      actual_status: inactiveResponse.status,
      error: inactiveBody?.error ?? null,
      pass: inactiveResponse.status === 402,
    });

    await run("ROI threshold filters weak result", "business", [], 200, { minRoi: 90 });
    const roiResult = results[results.length - 1];
    roiResult.pass = roiResult.pass === true && roiResult.result_count === 0;

    await run("AI score threshold filters weak result", "business", [], 200, { minScore: 99 });
    const scoreResult = results[results.length - 1];
    scoreResult.pass = scoreResult.pass === true && scoreResult.result_count === 0;

    return NextResponse.json({
      all_pass: results.every((result) => result.pass === true),
      passed: results.filter((result) => result.pass === true).length,
      total: results.length,
      results,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
}
