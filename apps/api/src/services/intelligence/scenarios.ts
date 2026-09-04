import type { ScenarioAssumptions, ScenarioBand, ScenarioResult } from "@trader/shared";

const DISCLAIMER =
  "Scenario prices are illustrative math from your assumptions — not forecasts or advice.";

function cloneAssumptions(
  base: ScenarioAssumptions,
  patch: Partial<ScenarioAssumptions>,
): ScenarioAssumptions {
  return { ...base, ...patch };
}

/**
 * Simple multi-year EPS / FCF multiple model for Bear / Base / Bull bands.
 * Uses current price + optional baseline EPS (or synthesizes from PE).
 */
export function simulateScenarios(input: {
  symbol: string;
  currentPrice: number | null;
  currency?: string;
  trailingEps?: number | null;
  assumptions: ScenarioAssumptions;
}): ScenarioResult {
  const base = input.assumptions;
  const price = input.currentPrice;
  const eps0 =
    input.trailingEps && input.trailingEps > 0
      ? input.trailingEps
      : price != null && base.peMultiple > 0
        ? price / base.peMultiple
        : null;

  const makeBand = (
    label: ScenarioBand["label"],
    assumptions: ScenarioAssumptions,
    growthMult: number,
    multipleMult: number,
  ): ScenarioBand => {
    const a = assumptions;
    if (eps0 == null || price == null) {
      return { label, assumptions: a, impliedPrice: null, impliedReturnPct: null };
    }
    const g = (a.epsGrowthPct / 100) * growthMult;
    const futureEps = eps0 * Math.pow(1 + g, a.years);
    const terminalMultiple = a.peMultiple * multipleMult * (1 + a.terminalGrowthPct / 200);
    // Blend P/E path with a light FCF/EV proxy so margin assumptions matter
    const fcfBoost = 1 + (a.fcfMarginPct - 10) / 200 + (a.operatingMarginPct - 15) / 300;
    const impliedPrice = futureEps * terminalMultiple * fcfBoost;
    const impliedReturnPct = ((impliedPrice - price) / price) * 100;
    return {
      label,
      assumptions: a,
      impliedPrice: Math.round(impliedPrice * 100) / 100,
      impliedReturnPct: Math.round(impliedReturnPct * 10) / 10,
    };
  };

  const bands: ScenarioBand[] = [
    makeBand(
      "bear",
      cloneAssumptions(base, {
        revenueGrowthPct: base.revenueGrowthPct * 0.4,
        epsGrowthPct: base.epsGrowthPct * 0.35,
        peMultiple: base.peMultiple * 0.75,
        evEbitdaMultiple: base.evEbitdaMultiple * 0.75,
        terminalGrowthPct: Math.max(-1, base.terminalGrowthPct - 1),
      }),
      0.55,
      0.8,
    ),
    makeBand("base", base, 1, 1),
    makeBand(
      "bull",
      cloneAssumptions(base, {
        revenueGrowthPct: base.revenueGrowthPct * 1.35,
        epsGrowthPct: base.epsGrowthPct * 1.4,
        peMultiple: base.peMultiple * 1.2,
        evEbitdaMultiple: base.evEbitdaMultiple * 1.15,
        terminalGrowthPct: Math.min(6, base.terminalGrowthPct + 0.5),
      }),
      1.35,
      1.15,
    ),
  ];

  return {
    symbol: input.symbol.toUpperCase(),
    currentPrice: price,
    currency: input.currency,
    baseAssumptions: base,
    bands,
    disclaimer: DISCLAIMER,
  };
}

export function defaultAssumptionsFromFundamentals(input: {
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  profitMargins?: number | null;
  trailingPe?: number | null;
  forwardPe?: number | null;
}): ScenarioAssumptions {
  const rev = input.revenueGrowth != null ? input.revenueGrowth * 100 : 10;
  const eps = input.earningsGrowth != null ? input.earningsGrowth * 100 : rev;
  const margin = input.profitMargins != null ? input.profitMargins * 100 : 18;
  const pe = input.forwardPe ?? input.trailingPe ?? 20;
  return {
    revenueGrowthPct: Math.round(rev * 10) / 10,
    epsGrowthPct: Math.round(eps * 10) / 10,
    operatingMarginPct: Math.round(margin * 10) / 10,
    fcfMarginPct: Math.round(Math.max(4, margin * 0.65) * 10) / 10,
    peMultiple: Math.round(pe * 10) / 10,
    evEbitdaMultiple: Math.round(Math.max(6, pe * 0.65) * 10) / 10,
    terminalGrowthPct: 2.5,
    years: 5,
  };
}
