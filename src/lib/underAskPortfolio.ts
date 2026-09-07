import { OTW_PUBLISHABLE_KEY, OTW_SUPABASE_URL } from "@/lib/ownTheWallConfig";

export type PortfolioStatus = "bought" | "listed" | "sold";

export type UnderAskPortfolioDeal = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  predictedAskPrice: number | null;
  predictedSalePrice: number | null;
  predictedProfit: number | null;
  predictedRoi: number | null;
  dealScore: number | null;
  purchasePrice: number;
  status: PortfolioStatus;
  listedPrice: number | null;
  salePrice: number | null;
  fuelCost: number;
  advertisingCost: number;
  platformFees: number;
  shippingCost: number;
  repairCost: number;
  otherCosts: number;
  totalInvested: number;
  actualProfit: number | null;
  actualRoi: number | null;
  shareToFeed: boolean;
  shareNote: string | null;
  boughtAt: string;
  listedAt: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePortfolioDealInput = {
  title: string;
  source?: string;
  sourceUrl?: string | null;
  predictedAskPrice?: number | null;
  predictedSalePrice?: number | null;
  predictedProfit?: number | null;
  predictedRoi?: number | null;
  dealScore?: number | null;
  purchasePrice: number;
  fuelCost?: number;
  advertisingCost?: number;
  platformFees?: number;
  shippingCost?: number;
  repairCost?: number;
  otherCosts?: number;
};

export type PortfolioDealPatch = Partial<{
  status: PortfolioStatus;
  listedPrice: number | null;
  salePrice: number | null;
  fuelCost: number;
  advertisingCost: number;
  platformFees: number;
  shippingCost: number;
  repairCost: number;
  otherCosts: number;
  shareToFeed: boolean;
  shareNote: string | null;
  listedAt: string | null;
  soldAt: string | null;
}>;

export type UnderAskSocialProfile = {
  displayName: string | null;
  scoreboardOptIn: boolean;
};

export type UnderAskWin = {
  winId: string;
  displayName: string;
  title: string;
  source: string;
  purchasePrice: number;
  salePrice: number;
  totalInvested: number;
  actualProfit: number;
  actualRoi: number;
  soldAt: string;
  shareNote: string | null;
  selfReported: boolean;
};

export type UnderAskScoreboardEntry = {
  rank: number;
  displayName: string;
  soldCount: number;
  totalProfit: number;
  bestRoi: number;
  metricValue: number;
  selfReported: boolean;
};

function headers(accessToken: string) {
  return {
    apikey: OTW_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function n(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function s(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function normalizeDeal(row: any): UnderAskPortfolioDeal {
  return {
    id: s(row?.id),
    title: s(row?.title),
    source: s(row?.source) || "Web",
    sourceUrl: optionalString(row?.source_url),
    predictedAskPrice: numberOrNull(row?.predicted_ask_price),
    predictedSalePrice: numberOrNull(row?.predicted_sale_price),
    predictedProfit: numberOrNull(row?.predicted_profit),
    predictedRoi: numberOrNull(row?.predicted_roi),
    dealScore: numberOrNull(row?.deal_score),
    purchasePrice: n(row?.purchase_price),
    status: row?.status === "listed" || row?.status === "sold" ? row.status : "bought",
    listedPrice: numberOrNull(row?.listed_price),
    salePrice: numberOrNull(row?.sale_price),
    fuelCost: n(row?.fuel_cost),
    advertisingCost: n(row?.advertising_cost),
    platformFees: n(row?.platform_fees),
    shippingCost: n(row?.shipping_cost),
    repairCost: n(row?.repair_cost),
    otherCosts: n(row?.other_costs),
    totalInvested: n(row?.total_invested),
    actualProfit: numberOrNull(row?.actual_profit),
    actualRoi: numberOrNull(row?.actual_roi),
    shareToFeed: Boolean(row?.share_to_feed),
    shareNote: optionalString(row?.share_note),
    boughtAt: s(row?.bought_at),
    listedAt: optionalString(row?.listed_at),
    soldAt: optionalString(row?.sold_at),
    createdAt: s(row?.created_at),
    updatedAt: s(row?.updated_at),
  };
}

const DEAL_SELECT = [
  "id","title","source","source_url","predicted_ask_price","predicted_sale_price","predicted_profit","predicted_roi","deal_score",
  "purchase_price","status","listed_price","sale_price","fuel_cost","advertising_cost","platform_fees","shipping_cost","repair_cost","other_costs",
  "total_invested","actual_profit","actual_roi","share_to_feed","share_note","bought_at","listed_at","sold_at","created_at","updated_at",
].join(",");

export async function fetchPortfolioDeals(accessToken: string) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_portfolio_deals?select=${DEAL_SELECT}&order=created_at.desc`,
    { headers: headers(accessToken), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Could not load your portfolio.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeDeal) : [];
}

export async function createPortfolioDeal(accessToken: string, input: CreatePortfolioDealInput) {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/underask_portfolio_deals`, {
    method: "POST",
    headers: { ...headers(accessToken), Prefer: "return=representation" },
    body: JSON.stringify({
      title: input.title.trim().slice(0, 500),
      source: input.source?.trim().slice(0, 120) || "Web",
      source_url: input.sourceUrl || null,
      predicted_ask_price: input.predictedAskPrice ?? null,
      predicted_sale_price: input.predictedSalePrice ?? null,
      predicted_profit: input.predictedProfit ?? null,
      predicted_roi: input.predictedRoi ?? null,
      deal_score: input.dealScore ?? null,
      purchase_price: input.purchasePrice,
      fuel_cost: input.fuelCost ?? 0,
      advertising_cost: input.advertisingCost ?? 0,
      platform_fees: input.platformFees ?? 0,
      shipping_cost: input.shippingCost ?? 0,
      repair_cost: input.repairCost ?? 0,
      other_costs: input.otherCosts ?? 0,
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = typeof detail?.message === "string" ? detail.message : "Could not add this deal to your portfolio.";
    if (message.includes("underask_portfolio_user_source_unique") || detail?.code === "23505") {
      throw new Error("This listing is already in your portfolio.");
    }
    throw new Error(message);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return normalizeDeal(row);
}

export async function updatePortfolioDeal(accessToken: string, id: string, patch: PortfolioDealPatch) {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.listedPrice !== undefined) body.listed_price = patch.listedPrice;
  if (patch.salePrice !== undefined) body.sale_price = patch.salePrice;
  if (patch.fuelCost !== undefined) body.fuel_cost = patch.fuelCost;
  if (patch.advertisingCost !== undefined) body.advertising_cost = patch.advertisingCost;
  if (patch.platformFees !== undefined) body.platform_fees = patch.platformFees;
  if (patch.shippingCost !== undefined) body.shipping_cost = patch.shippingCost;
  if (patch.repairCost !== undefined) body.repair_cost = patch.repairCost;
  if (patch.otherCosts !== undefined) body.other_costs = patch.otherCosts;
  if (patch.shareToFeed !== undefined) body.share_to_feed = patch.shareToFeed;
  if (patch.shareNote !== undefined) body.share_note = patch.shareNote?.trim().slice(0, 280) || null;
  if (patch.listedAt !== undefined) body.listed_at = patch.listedAt;
  if (patch.soldAt !== undefined) body.sold_at = patch.soldAt;

  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_portfolio_deals?id=eq.${encodeURIComponent(id)}&select=${DEAL_SELECT}`,
    {
      method: "PATCH",
      headers: { ...headers(accessToken), Prefer: "return=representation" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || "Could not update this portfolio deal.");
  }
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("Portfolio update was incomplete.");
  return normalizeDeal(row);
}

export async function deletePortfolioDeal(accessToken: string, id: string) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_portfolio_deals?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(accessToken) },
  );
  if (!response.ok) throw new Error("Could not delete this portfolio deal.");
}

export async function fetchSocialProfile(accessToken: string): Promise<UnderAskSocialProfile> {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_social_profiles?select=display_name,scoreboard_opt_in&limit=1`,
    { headers: headers(accessToken), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Could not load your community profile.");
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    displayName: optionalString(row?.display_name),
    scoreboardOptIn: Boolean(row?.scoreboard_opt_in),
  };
}

export async function saveSocialProfile(
  accessToken: string,
  userId: string,
  input: UnderAskSocialProfile,
) {
  const response = await fetch(
    `${OTW_SUPABASE_URL}/rest/v1/underask_social_profiles?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        ...headers(accessToken),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        display_name: input.displayName?.trim().slice(0, 40) || null,
        scoreboard_opt_in: input.scoreboardOptIn,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || "Could not update your community profile.");
  }
}

export async function fetchWinsFeed(accessToken: string, limit = 30, offset = 0): Promise<UnderAskWin[]> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_wins_feed`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({ p_limit: limit, p_offset: offset }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load the wins feed.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row: any) => ({
        winId: s(row?.win_id),
        displayName: s(row?.display_name) || "UnderAsk Trader",
        title: s(row?.title),
        source: s(row?.source),
        purchasePrice: n(row?.purchase_price),
        salePrice: n(row?.sale_price),
        totalInvested: n(row?.total_invested),
        actualProfit: n(row?.actual_profit),
        actualRoi: n(row?.actual_roi),
        soldAt: s(row?.sold_at),
        shareNote: optionalString(row?.share_note),
        selfReported: Boolean(row?.self_reported),
      }))
    : [];
}

export async function fetchScoreboard(
  accessToken: string,
  metric: "profit" | "roi",
  limit = 50,
): Promise<UnderAskScoreboardEntry[]> {
  const response = await fetch(`${OTW_SUPABASE_URL}/rest/v1/rpc/underask_scoreboard`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({ p_metric: metric, p_limit: limit }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load the scoreboard.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row: any) => ({
        rank: n(row?.rank),
        displayName: s(row?.display_name) || "UnderAsk Trader",
        soldCount: n(row?.sold_count),
        totalProfit: n(row?.total_profit),
        bestRoi: n(row?.best_roi),
        metricValue: n(row?.metric_value),
        selfReported: Boolean(row?.self_reported),
      }))
    : [];
}
