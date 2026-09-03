export type PlanId = "scout" | "pro" | "multi-pro" | "business";

export type SearchPlanRule = {
  id: PlanId;
  name: string;
  minSites: number;
  maxSites: number | null;
  broadWithoutSelection: boolean;
};

export const SEARCH_PLAN_RULES: Record<PlanId, SearchPlanRule> = {
  scout: {
    id: "scout",
    name: "Scout",
    minSites: 1,
    maxSites: 1,
    broadWithoutSelection: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    minSites: 1,
    maxSites: 2,
    broadWithoutSelection: false,
  },
  "multi-pro": {
    id: "multi-pro",
    name: "Multi Pro",
    minSites: 1,
    maxSites: 3,
    broadWithoutSelection: false,
  },
  business: {
    id: "business",
    name: "Business",
    minSites: 0,
    maxSites: null,
    broadWithoutSelection: true,
  },
};

export function normalizePlan(value: unknown): PlanId {
  return value === "scout" || value === "pro" || value === "multi-pro" || value === "business"
    ? value
    : "scout";
}
