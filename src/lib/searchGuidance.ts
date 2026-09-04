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
}): SearchGuidance[] {
  const query = (input.query || "").trim();
  const roi = numeric(input.minRoi);
  const score = numeric(input.minScore);
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

  if ((roi ?? 0) >= 100 && (score ?? 0) >= 90) {
    guidance.push({
      severity: "danger",
      title: "Double-restricted search",
      message: "High ROI plus a very high AI score can eliminate nearly every listing. Reduce at least one filter if your priority is finding something today.",
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
}) {
  const roi = numeric(input.minRoi);
  const score = numeric(input.minScore);

  if ((roi ?? 0) >= 100 && (score ?? 0) >= 90) {
    return {
      title: "Your filters are probably too strict.",
      message: `UnderAsk completed the live search and used 1 search, but nothing passed both ${roi}% ROI and ${score}/100 AI score. Lower one of them and try again.`,
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

  return {
    title: "No deal passed the current filters.",
    message: "This completed search used 1 search. Try a broader product description, lower the ROI or AI-score threshold, or change your marketplace priority.",
  };
}
