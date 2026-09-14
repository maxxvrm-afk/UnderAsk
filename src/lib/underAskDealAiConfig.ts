export const UNDERASK_DEAL_MODEL = process.env.OPENAI_DEAL_MODEL || "gpt-5.6-luna";

export const SITE_LABELS: Record<string, string> = {
  marktplaats: "Marktplaats",
  ebay: "eBay",
  "2dehands": "2dehands",
  kleinanzeigen: "Kleinanzeigen",
  vinted: "Vinted",
  catawiki: "Catawiki",
  facebook: "Facebook Marketplace",
  autoscout24: "AutoScout24",
};

export const CONDITION_LABELS: Record<string, string> = {
  any: "Any condition is acceptable if the economics are strong.",
  ready: "Prefer working, complete items that need no meaningful repair before resale. Exclude broken or parts-only projects.",
  cosmetic_ok: "Working items with cosmetic wear, scratches or easy detailing work are acceptable, but avoid meaningful mechanical/electronic repair projects.",
  repair_ok: "Repair projects and damaged items are acceptable when the likely repair cost is included conservatively and the margin still works.",
};

export const DEAL_SCHEMA = {
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
                kind: { type: "string", enum: ["sold", "asking", "market_reference"] },
              },
              required: ["title", "url", "source", "price", "kind"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "title", "url", "source", "ask_price", "estimated_fees",
          "estimated_shipping", "estimated_repair_cost", "confidence",
          "speed_to_sell", "reasoning", "risks", "comparables",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["deals"],
  additionalProperties: false,
} as const;
