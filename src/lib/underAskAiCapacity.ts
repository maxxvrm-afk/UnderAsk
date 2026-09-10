import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

export type UnderAskAiCapacity = {
  queuedManual: number;
  queuedAlert: number;
  running: number;
  maxConcurrency: number;
  alertMaxConcurrency: number;
  pauseUntil: string | null;
  lastRateLimitAt: string | null;
  jobs24h: number;
  completed24h: number;
  failed24h: number;
  refunded24h: number;
  rateLimited24h: number;
  avgRuntimeMs: number;
  inputTokens24h: number;
  outputTokens24h: number;
  latestRemainingRequests: number | null;
  latestRemainingTokens: number | null;
  latestResetRequests: string | null;
  latestResetTokens: string | null;
  latestOpenAiRequestId: string | null;
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export async function fetchUnderAskAiCapacity(accessToken: string): Promise<UnderAskAiCapacity> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_owner_ai_capacity`, {
    method: "POST",
    headers: {
      apikey: OTW_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("OWNER_ACCESS_REQUIRED");
    const detail = await response.json().catch(() => null);
    if (typeof detail?.message === "string" && detail.message.includes("not_authorized")) {
      throw new Error("OWNER_ACCESS_REQUIRED");
    }
    throw new Error("Could not load AI capacity.");
  }

  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Could not load AI capacity.");

  return {
    queuedManual: n(row.queued_manual),
    queuedAlert: n(row.queued_alert),
    running: n(row.running),
    maxConcurrency: n(row.max_concurrency),
    alertMaxConcurrency: n(row.alert_max_concurrency),
    pauseUntil: nullableString(row.pause_until),
    lastRateLimitAt: nullableString(row.last_rate_limit_at),
    jobs24h: n(row.jobs_24h),
    completed24h: n(row.completed_24h),
    failed24h: n(row.failed_24h),
    refunded24h: n(row.refunded_24h),
    rateLimited24h: n(row.rate_limited_24h),
    avgRuntimeMs: n(row.avg_runtime_ms),
    inputTokens24h: n(row.input_tokens_24h),
    outputTokens24h: n(row.output_tokens_24h),
    latestRemainingRequests: nullableNumber(row.latest_remaining_requests),
    latestRemainingTokens: nullableNumber(row.latest_remaining_tokens),
    latestResetRequests: nullableString(row.latest_reset_requests),
    latestResetTokens: nullableString(row.latest_reset_tokens),
    latestOpenAiRequestId: nullableString(row.latest_openai_request_id),
  };
}
