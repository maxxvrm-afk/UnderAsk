export type SearchGuidance = {
  severity: "notice" | "warning" | "danger";
  title: string;
  message: string;
};

function numeric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getSearchGuidance(input: {
  query?: string;
  minRoi?: number | string | null;
  minScore?: number | string | null;
  minProfit?: number | string | null;
  maxAskPrice?: number | string | null;
  conditionPreference?: string | null;
}): SearchGuidance[] {
  const query = (input.query || "").trim();
  const roi = numeric(input.minRoi);
  const score = numeric(input.minScore);
  const profit = numeric(input.minProfit);
  const maxAsk = numeric(input.maxAskPrice);
  const condition = input.conditionPreference || "any";
  const guidance: SearchGuidance[] = [];

  if (roi !== null) {
    if (roi >= 300) {
      guidance.push({
        severity: "danger",
        title: "Extremely high ROI target",
        message: `${roi}%+ ROI deals are rare. Consider 50–100% if you want a much wider result pool. You can still search, but it will use 1 search even if nothing passes the filter.`,
      });
    } else if (roi >= 150) {
      guidance.push({
        severity: "warning",
        title: "Very aggressive ROI target",
        message: `${roi}% ROI can leave you with very few matches. Lowering it toward 50–100% usually gives UnderAsk more room to find viable flips.`,
      });
    } else if (roi >= 100) {
      guidance.push({
        severity: "notice",
        title: "Aggressive ROI target",
        message: `A ${roi}% minimum is selective. If results are thin, lower the ROI before narrowing the product further.`,
      });
    }
  }

  if (score !== null) {
    if (score >= 95) {
      guidance.push({
        severity: "danger",
        title: "AI score is almost perfect-only",
        message: `${score}/100 only allows exceptional deals through. Try 75–85 for a healthier mix. Searching anyway still uses 1 search if no deal reaches the score.`,
      });
    } else if (score >= 90) {
      guidance.push({
        severity: "warning",
        title: "Very strict AI score",
        message: `${score}/100 can filter out otherwise profitable listings. Try 75–85 if you want more opportunities.`,
      });
    } else if (score >= 85) {
      guidance.push({
        severity: "notice",
        title: "Selective AI score",
        message: `${score}/100 is a strong quality filter. Good for precision, but expect fewer results.`,
      });
    }
  }

  if (profit !== null) {
    if (profit >= 1000) {
      guidance.push({
        severity: "danger",
        title: "Very high minimum profit",
        message: `€${profit}+ net profit per flip is possible in expensive categories, but it will eliminate most ordinary deals. Searching anyway still uses 1 search if nothing clears it.`,
      });
    } else if (profit >= 500) {
      guidance.push({
        severity: "warning",
        title: "High minimum profit",
        message: `A €${profit} minimum strongly favors higher-ticket flips. If you want more frequent opportunities, try €100–€300.`,
      });
    } else if (profit >= 250) {
      guidance.push({
        severity: "notice",
        title: "Selective profit target",
        message: `€${profit}+ net profit is a useful serious-flip filter, but smaller fast-moving deals will be removed.`,
      });
    }
  }

  if (maxAsk !== null) {
    if (maxAsk <= 10) {
      guidance.push({
        severity: "danger",
        title: "Extremely small buying budget",
        message: `A €${maxAsk} maximum purchase price leaves very little room for verified, resellable listings. Increase the budget if the result pool is empty.`,
      });
    } else if (maxAsk <= 30) {
      guidance.push({
        severity: "warning",
        title: "Very small buying budget",
        message: `With a €${maxAsk} max purchase price, UnderAsk will mostly find low-ticket flips. Expect fewer listings with strong absolute profit.`,
      });
    }
  }

  if (profit !== null && maxAsk !== null && maxAsk > 0) {
    if (profit >= maxAsk * 3) {
      guidance.push({
        severity: "danger",
        title: "Budget and profit target barely match",
        message: `You want at least €${profit} net profit while paying no more than €${maxAsk}. That requires an unusually large pricing mistake. Lower the profit target or raise the buying budget for more results.`,
      });
    } else if (profit >= maxAsk * 1.5) {
      guidance.push({
        severity: "warning",
        title: "Aggressive budget-to-profit ratio",
        message: `Making €${profit}+ net profit from a maximum €${maxAsk} purchase is selective. UnderAsk may find nothing even when decent flips exist.`,
      });
    }
  }

  if ((roi ?? 0) >= 100 && (score ?? 0) >= 90) {
    guidance.push({
      severity: "danger",
      title: "Double-restricted search",
      message: "High ROI plus a very high AI score can eliminate nearly every listing. Reduce at least one filter if your priority is finding something today.",
    });
  }

  const hardFilterCount = [roi, score, profit, maxAsk].filter((value) => value !== null).length;
  if (hardFilterCount >= 4 && ((roi ?? 0) >= 75 || (score ?? 0) >= 85)) {
    guidance.push({
      severity: "warning",
      title: "Many filters are stacked together",
      message: "ROI, score, profit and budget all have to pass at the same time. If results are empty, loosen one requirement instead of changing the product immediately.",
    });
  }

  if (condition === "ready" && ((roi ?? 0) >= 100 || (profit ?? 0) >= 500)) {
    guidance.push({
      severity: "notice",
      title: "Ready-to-resell only narrows high-margin searches",
      message: "Requiring items that need no meaningful work removes damaged bargains that often create the biggest margins.",
    });
  }

  if (query) {
    const words = query.split(/\s+/).filter(Boolean);
    if (words.length === 1 && query.length < 24) {
      guidance.push({
        severity: "notice",
        title: "Search is very broad",
        message: "Add a model, generation, condition, size, set, or other useful detail if you get too many weak matches.",
      });
    } else if (query.length >= 180 || words.length >= 28) {
      guidance.push({
        severity: "warning",
        title: "Search may be over-specified",
        message: "Too many exact requirements can leave no eligible listings. Keep the must-haves, but remove nice-to-have details if results are empty.",
      });
    }
  }

  return guidance;
}

export function getNoResultsAdvice(input: {
  query?: string;
  minRoi?: number | null;
  minScore?: number | null;
  minProfit?: number | null;
  maxAskPrice?: number | null;
}) {
  const roi = numeric(input.minRoi);
  const score = numeric(input.minScore);
  const profit = numeric(input.minProfit);
  const maxAsk = numeric(input.maxAskPrice);

  if (profit !== null && maxAsk !== null && maxAsk > 0 && profit >= maxAsk * 1.5) {
    return {
      title: "Your budget and profit target are probably fighting each other.",
      message: `UnderAsk completed the live search and used 1 search, but nothing could meet both a €${maxAsk} max buy price and €${profit}+ net profit. Raise the budget or lower the profit requirement.`,
    };
  }

  if ((roi ?? 0) >= 100 && (score ?? 0) >= 90) {
    return {
      title: "Your filters are probably too strict.",
      message: `UnderAsk completed the live search and used 1 search, but nothing passed both ${roi}% ROI and ${score}/100 AI score. Lower one of them and try again.`,
    };
  }

  if ((profit ?? 0) >= 500) {
    return {
      title: "Your profit requirement may be too high for this market.",
      message: `This completed search used 1 search, but no verified deal cleared €${profit} net profit. Lower the target or search a higher-ticket category.`,
    };
  }

  if ((roi ?? 0) >= 150) {
    return {
      title: "Your ROI target may be choking the search.",
      message: `UnderAsk completed the live search and used 1 search, but no listing cleared ${roi}% ROI. Try 50–100% for a wider result pool.`,
    };
  }

  if ((score ?? 0) >= 90) {
    return {
      title: "Your AI-score filter may be too strict.",
      message: `UnderAsk completed the live search and used 1 search, but no listing reached ${score}/100. Try 75–85 to let more profitable candidates through.`,
    };
  }

  if (maxAsk !== null && maxAsk <= 30) {
    return {
      title: "Your buying budget may be too low.",
      message: `This completed search used 1 search, but no verified listing under €${maxAsk} cleared the other quality checks. Raise the max buy price or broaden the product.` ,
    };
  }

  return {
    title: "No deal passed the current filters.",
    message: "This completed search used 1 search. Try a broader product description, lower a profit/ROI/score threshold, raise the buying budget, or change your marketplace priority.",
  };
}
