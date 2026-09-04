import type { OpportunityCard, PortfolioHealth, PortfolioHolding } from "@trader/shared";

type WeightInput = {
  symbol: string;
  weight: number;
};

/**
 * Portfolio health. Prefer Freetrade (or other broker) holdings weights when provided;
 * otherwise fall back to equal-weight watchlist proxy.
 */
export function buildPortfolioHealth(
  opportunities: OpportunityCard[],
  priorScores?: Map<string, number>,
  opts?: {
    holdingsProxy?: "watchlist" | "freetrade";
    note?: string;
    weights?: WeightInput[];
    holdings?: PortfolioHolding[];
  },
): PortfolioHealth {
  const holdingsProxy = opts?.holdingsProxy ?? "watchlist";
  const note =
    opts?.note ??
    (holdingsProxy === "freetrade"
      ? "Health uses your Freetrade holdings (cost-basis / market-value weights)."
      : "No broker ledger connected — health uses your watchlist as an equal-weight holdings proxy.");

  if (opportunities.length === 0) {
    return {
      healthScore: 50,
      holdingsProxy,
      note,
      symbolCount: 0,
      strongest: [],
      weakest: [],
      concentration: {
        topSymbolSharePct: null,
        sectorProxy:
          holdingsProxy === "freetrade"
            ? "Freetrade holdings (no sector taxonomy stored)"
            : "Equal-weight watchlist (no sector taxonomy stored)",
        warning: null,
      },
      deteriorating: [],
      improving: [],
      averageOpportunityScore: null,
      averageRiskScore: null,
      holdings: opts?.holdings,
    };
  }

  const weightMap = new Map<string, number>();
  if (opts?.weights?.length) {
    const total = opts.weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
    for (const w of opts.weights) {
      weightMap.set(w.symbol, total > 0 ? Math.max(0, w.weight) / total : 0);
    }
  } else {
    for (const o of opportunities) {
      weightMap.set(o.symbol, 1 / opportunities.length);
    }
  }

  const avgOpp =
    opportunities.reduce((s, o) => s + o.opportunityScore * (weightMap.get(o.symbol) ?? 0), 0) ||
    opportunities.reduce((s, o) => s + o.opportunityScore, 0) / opportunities.length;
  const avgRisk =
    opportunities.reduce((s, o) => s + o.riskScore * (weightMap.get(o.symbol) ?? 0), 0) ||
    opportunities.reduce((s, o) => s + o.riskScore, 0) / opportunities.length;
  const avgConv =
    opportunities.reduce((s, o) => s + o.convictionScore * (weightMap.get(o.symbol) ?? 0), 0) ||
    opportunities.reduce((s, o) => s + o.convictionScore, 0) / opportunities.length;

  const healthScore = Math.round(
    Math.max(5, Math.min(95, avgOpp * 0.55 + (100 - avgRisk) * 0.3 + avgConv * 0.15)),
  );

  const sorted = [...opportunities].sort(
    (a, b) => b.opportunityScore - a.opportunityScore,
  );
  const strongest = sorted.slice(0, 3).map((o) => ({
    symbol: o.symbol,
    opportunityScore: o.opportunityScore,
    reason: o.keyReason,
  }));
  const weakest = sorted
    .slice(-3)
    .reverse()
    .map((o) => ({
      symbol: o.symbol,
      opportunityScore: o.opportunityScore,
      reason: o.keyReason,
    }));

  let topShare = 0;
  for (const w of weightMap.values()) {
    topShare = Math.max(topShare, w);
  }
  topShare = Math.round(topShare * 1000) / 10;

  const concentrationWarning =
    topShare >= 40
      ? `${topShare}% in a single name — concentration risk is elevated.`
      : opportunities.length <= 3
        ? "Very few names — concentration risk is high."
        : opportunities.length <= 6
          ? "Small portfolio — outcomes will be dominated by a few names."
          : null;

  const deteriorating: string[] = [];
  const improving: string[] = [];
  if (priorScores) {
    for (const o of opportunities) {
      const prev = priorScores.get(o.symbol);
      if (prev == null) continue;
      if (o.opportunityScore <= prev - 8) deteriorating.push(o.symbol);
      if (o.opportunityScore >= prev + 8) improving.push(o.symbol);
    }
  } else {
    for (const o of opportunities) {
      if (o.riskScore >= 70 && o.opportunityScore <= 45) deteriorating.push(o.symbol);
      if (o.opportunityScore >= 70 && o.riskScore <= 45) improving.push(o.symbol);
    }
  }

  return {
    healthScore,
    holdingsProxy,
    note,
    symbolCount: opportunities.length,
    strongest,
    weakest,
    concentration: {
      topSymbolSharePct: topShare,
      sectorProxy:
        holdingsProxy === "freetrade"
          ? "Freetrade holdings (no sector taxonomy stored)"
          : "Equal-weight watchlist (no sector taxonomy stored)",
      warning: concentrationWarning,
    },
    deteriorating: [...new Set(deteriorating)],
    improving: [...new Set(improving)],
    averageOpportunityScore: Math.round(avgOpp),
    averageRiskScore: Math.round(avgRisk),
    holdings: opts?.holdings,
  };
}
