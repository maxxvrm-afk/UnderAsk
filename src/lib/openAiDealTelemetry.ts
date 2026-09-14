export type OpenAITelemetry = {
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetRequests: string | null;
  resetTokens: string | null;
  rateLimitHits: number;
};

export class OpenAIRequestError extends Error {
  status: number;
  code: string;
  telemetry: OpenAITelemetry;

  constructor(status: number, code: string, message: string, telemetry: OpenAITelemetry) {
    super(message);
    this.status = status;
    this.code = code;
    this.telemetry = telemetry;
  }
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function headerInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  return value === null ? null : integer(value);
}

export function readOpenAITelemetry(
  response: Response,
  body: any,
  rateLimitHits = 0,
): OpenAITelemetry {
  return {
    requestId: response.headers.get("x-request-id"),
    inputTokens: integer(body?.usage?.input_tokens),
    outputTokens: integer(body?.usage?.output_tokens),
    remainingRequests: headerInteger(response.headers, "x-ratelimit-remaining-requests"),
    remainingTokens: headerInteger(response.headers, "x-ratelimit-remaining-tokens"),
    resetRequests: response.headers.get("x-ratelimit-reset-requests"),
    resetTokens: response.headers.get("x-ratelimit-reset-tokens"),
    rateLimitHits,
  };
}

export async function runOpenAIDealRequest(options: {
  key: string;
  model: string;
  prompt: string;
  schema: unknown;
  schemaName: string;
}) {
  let rateLimitHits = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.key}`,
      },
      body: JSON.stringify({
        model: options.model,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        input: options.prompt,
        max_output_tokens: 4200,
        text: {
          format: {
            type: "json_schema",
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
      }),
      cache: "no-store",
    });

    const raw = await response.text();
    let body: any = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }

    if (response.status === 429) rateLimitHits += 1;
    const telemetry = readOpenAITelemetry(response, body, rateLimitHits);

    if (response.ok) return { body, telemetry };

    const code =
      typeof body?.error?.code === "string"
        ? body.error.code
        : `HTTP_${response.status}`;
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `OpenAI request failed with status ${response.status}`;

    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const fallbackMs = 1500 * Math.pow(2, attempt);
      const retryMs = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 7000)
        : Math.min(fallbackMs, 7000);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      continue;
    }

    throw new OpenAIRequestError(response.status, code, message, telemetry);
  }

  throw new OpenAIRequestError(429, "RATE_LIMIT", "OpenAI rate limit reached", {
    requestId: null,
    inputTokens: null,
    outputTokens: null,
    remainingRequests: null,
    remainingTokens: null,
    resetRequests: null,
    resetTokens: null,
    rateLimitHits: 3,
  });
}

export function outputText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}
