import type { MarketExpectations } from "@trader/shared";

export function buildMarketExpectations(input: {
  price: number | null;
  targetPrice: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  profitMargins: number | null;
  valuationLabel: string | null;
  analystKey: string | null;
}): MarketExpectations {
  const upside =
    input.price != null && input.targetPrice != null && input.price > 0
      ? ((input.targetPrice - input.price) / input.price) * 100
      : null;

  const impliedPe = input.forwardPe ?? input.trailingPe;
  const historicalPe = input.trailingPe;
  // Without a true peer set, hint using a soft band around sector-typical multiples
  const peerPeHint =
    historicalPe != null ? Math.round(historicalPe * 0.9 * 10) / 10 : impliedPe;

  const impliedRev =
    input.revenueGrowth != null ? Math.round(input.revenueGrowth * 1000) / 10 : null;
  const impliedEps =
    input.earningsGrowth != null ? Math.round(input.earningsGrowth * 1000) / 10 : null;
  const impliedMargin =
    input.profitMargins != null ? Math.round(input.profitMargins * 1000) / 10 : null;

  // Gap: positive = market/analyst embeds more optimism than a "normalized" view
  let gap = 0;
  let gapParts = 0;
  if (upside != null) {
    gap += upside / 20;
    gapParts++;
  }
  if (impliedPe != null && peerPeHint != null && peerPeHint > 0) {
    gap += (impliedPe - peerPeHint) / peerPeHint;
    gapParts++;
  }
  if (impliedEps != null) {
    gap += impliedEps / 40;
    gapParts++;
  }
  const expectationGap =
    gapParts > 0 ? Math.round((gap / gapParts) * 100) / 100 : null;

  const gapSummary =
    expectationGap == null
      ? "Insufficient data to quantify an expectation gap."
      : expectationGap > 0.35
        ? "Market/analyst setup looks optimistic vs a normalized multiple/growth view."
        : expectationGap < -0.25
          ? "Pricing looks cautious vs targets and growth prints — possible under-expectation."
          : "Expectations look roughly balanced vs available growth and multiple data.";

  const opportunityWhy =
    (upside != null && upside > 10
      ? `Consensus target implies ${upside.toFixed(1)}% upside. `
      : "") +
    (input.valuationLabel ? `Valuation read: ${input.valuationLabel}. ` : "") +
    (expectationGap != null && expectationGap < -0.2
      ? "Gap suggests the bar may be easier to clear if execution holds."
      : "Watch whether fundamentals can clear the embedded bar.");

  const falsifiers = [
    "Earnings or revenue miss that resets growth assumptions.",
    "Multiple compression if rates or risk appetite shift.",
    input.analystKey
      ? `Analyst downgrades away from ${input.analystKey.replace(/_/g, " ")}.`
      : "Material deterioration in analyst coverage or targets.",
  ];

  return {
    impliedRevenueGrowthPct: impliedRev,
    impliedEarningsGrowthPct: impliedEps,
    impliedOperatingMarginPct: impliedMargin,
    impliedPe,
    impliedEvEbitda: impliedPe != null ? Math.round(impliedPe * 0.7 * 10) / 10 : null,
    historicalPe,
    peerPeHint,
    analystTargetUpsidePct: upside,
    expectationGap,
    gapSummary,
    opportunityWhy: opportunityWhy.trim(),
    falsifiers,
  };
}
