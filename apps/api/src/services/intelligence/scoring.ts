import type {
  IntelligenceAction,
  OpportunityBreakdown,
  OpportunityCategory,
  ScoreComponent,
} from "@trader/shared";

export type ScoringInput = {
  price: number | null;
  targetPrice: number | null;
  upsidePct: number | null;
  return1yPct: number | null;
  return1mPct: number | null;
  maxDrawdown1yPct: number | null;
  volatilityDailyPct: number | null;
  volumeSpikeRatio: number | null;
  analystKey: string | null;
  analystMean: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  profitMargins: number | null;
  valuationLabel: string | null;
  shortTermDirection: string | null;
  intermediateTermDirection: string | null;
  longTermDirection: string | null;
  insiderSentiment: number | null;
  sectorInsiderSentiment: number | null;
  daysToEarnings: number | null;
  recentDevelopmentCount: number;
  hasUnusualNews: boolean;
};

export type ScoredOpportunity = {
  opportunityScore: number;
  riskScore: number;
  convictionScore: number;
  breakdown: OpportunityBreakdown;
  categories: OpportunityCategory[];
  action: IntelligenceAction;
  /** Signed -1..1 legacy score */
  score: number;
  confidence: number;
  keyReason: string;
  potentialUpsidePct: number | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function component(
  id: string,
  label: string,
  score: number,
  weight: number,
  note: string | null,
): ScoreComponent {
  return { id, label, score: Math.round(clamp(score, 0, 100)), weight, note };
}

function directionScore(direction: string | null | undefined): number | null {
  if (!direction) return null;
  const d = direction.toLowerCase();
  if (d === "bullish") return 78;
  if (d === "bearish") return 22;
  return 50;
}

function analystKeyScore(key: string | null | undefined): number | null {
  if (!key) return null;
  const k = key.toLowerCase().replace(/_/g, " ");
  if (k.includes("strong buy")) return 92;
  if (k === "buy") return 75;
  if (k.includes("strong sell")) return 8;
  if (k === "sell" || k === "underperform") return 22;
  if (k === "hold" || k === "neutral") return 48;
  return 50;
}

function valuationScore(label: string | null, upsidePct: number | null, trailingPe: number | null): {
  score: number;
  note: string | null;
} {
  let score = 50;
  const notes: string[] = [];
  if (label) {
    const v = label.toLowerCase();
    if (v.includes("undervalued") || v.includes("discount")) {
      score += 22;
      notes.push(label);
    } else if (v.includes("overvalued") || v.includes("premium")) {
      score -= 22;
      notes.push(label);
    } else {
      notes.push(label);
    }
  }
  if (upsidePct != null) {
    score += clamp(upsidePct / 1.2, -25, 30);
    notes.push(`Analyst upside ${upsidePct.toFixed(1)}%`);
  }
  if (trailingPe != null && trailingPe > 0) {
    if (trailingPe < 15) score += 8;
    else if (trailingPe > 40) score -= 10;
  }
  return { score: clamp(score, 0, 100), note: notes[0] ?? null };
}

/**
 * Opportunity Score 0–100 with expandable component breakdown.
 * Informational heuristic — not a prediction or guarantee.
 */
export function computeOpportunityScores(input: ScoringInput): ScoredOpportunity {
  const upsidePct =
    input.upsidePct ??
    (input.price != null && input.targetPrice != null && input.price > 0
      ? ((input.targetPrice - input.price) / input.price) * 100
      : null);

  const fundamentalsParts: number[] = [];
  const fundNotes: string[] = [];
  if (input.revenueGrowth != null) {
    fundamentalsParts.push(clamp(50 + input.revenueGrowth * 100, 5, 95));
    fundNotes.push(`Rev growth ${(input.revenueGrowth * 100).toFixed(1)}%`);
  }
  if (input.profitMargins != null) {
    fundamentalsParts.push(clamp(40 + input.profitMargins * 120, 5, 95));
  }
  const fundamentals = component(
    "fundamentals",
    "Fundamentals",
    fundamentalsParts.length
      ? fundamentalsParts.reduce((a, b) => a + b, 0) / fundamentalsParts.length
      : 50,
    1.1,
    fundNotes[0] ?? null,
  );

  const val = valuationScore(input.valuationLabel, upsidePct, input.trailingPe);
  const valuation = component("valuation", "Valuation", val.score, 1.35, val.note);

  const earnParts: number[] = [];
  if (input.earningsGrowth != null) {
    earnParts.push(clamp(50 + input.earningsGrowth * 110, 5, 95));
  }
  if (input.forwardPe != null && input.trailingPe != null && input.trailingPe > 0) {
    const cheapening = (input.trailingPe - input.forwardPe) / input.trailingPe;
    earnParts.push(clamp(50 + cheapening * 80, 10, 90));
  }
  const earningsMomentum = component(
    "earningsMomentum",
    "Earnings momentum",
    earnParts.length ? earnParts.reduce((a, b) => a + b, 0) / earnParts.length : 50,
    1.0,
    input.earningsGrowth != null
      ? `EPS growth ${((input.earningsGrowth ?? 0) * 100).toFixed(1)}%`
      : null,
  );

  const techScores = [
    directionScore(input.shortTermDirection),
    directionScore(input.intermediateTermDirection),
    directionScore(input.longTermDirection),
  ].filter((x): x is number => x != null);
  const technicals = component(
    "technicals",
    "Technicals",
    techScores.length ? techScores.reduce((a, b) => a + b, 0) / techScores.length : 50,
    1.05,
    input.longTermDirection ? `Long-term ${input.longTermDirection}` : null,
  );

  let insiderScore = 50;
  let insiderNote: string | null = null;
  if (input.insiderSentiment != null && input.sectorInsiderSentiment != null) {
    const vs = input.insiderSentiment - input.sectorInsiderSentiment;
    insiderScore = clamp(50 + vs * 80, 5, 95);
    insiderNote = `Insider vs sector ${vs >= 0 ? "+" : ""}${vs.toFixed(2)}`;
  } else if (input.insiderSentiment != null) {
    insiderScore = clamp(50 + input.insiderSentiment * 40, 10, 90);
  }
  const insiderActivity = component(
    "insiderActivity",
    "Insider activity",
    insiderScore,
    0.7,
    insiderNote,
  );

  let catalystScore = 45;
  let catalystNote: string | null = null;
  if (input.daysToEarnings != null && input.daysToEarnings >= 0 && input.daysToEarnings <= 21) {
    catalystScore += 18;
    catalystNote = `Earnings in ${input.daysToEarnings}d`;
  } else if (input.daysToEarnings != null && input.daysToEarnings <= 45) {
    catalystScore += 8;
    catalystNote = `Earnings in ${input.daysToEarnings}d`;
  }
  if (input.recentDevelopmentCount > 0) {
    catalystScore += Math.min(15, input.recentDevelopmentCount * 6);
  }
  if (input.hasUnusualNews) catalystScore += 10;
  const catalysts = component(
    "catalysts",
    "Catalysts",
    clamp(catalystScore, 0, 100),
    0.85,
    catalystNote,
  );

  const analystScore = analystKeyScore(input.analystKey);
  let sentimentRaw = analystScore ?? 50;
  if (input.analystMean != null) {
    // Yahoo: 1 = strong buy … 5 = strong sell
    sentimentRaw = (sentimentRaw + clamp((3 - input.analystMean) * 25 + 50, 5, 95)) / 2;
  }
  const sentiment = component(
    "sentiment",
    "Sentiment",
    sentimentRaw,
    1.15,
    input.analystKey ? `Consensus ${input.analystKey.replace(/_/g, " ")}` : null,
  );

  const breakdown: OpportunityBreakdown = {
    fundamentals,
    valuation,
    earningsMomentum,
    technicals,
    insiderActivity,
    catalysts,
    sentiment,
  };

  const comps = Object.values(breakdown);
  const totalWeight = comps.reduce((s, c) => s + c.weight, 0);
  const opportunityScore = Math.round(
    comps.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight,
  );

  // Risk: higher = more risk
  let risk = 35;
  if (input.volatilityDailyPct != null) {
    risk += clamp(input.volatilityDailyPct * 8, 0, 35);
  }
  if (input.maxDrawdown1yPct != null) {
    risk += clamp(Math.abs(input.maxDrawdown1yPct) / 2.2, 0, 30);
  }
  if (input.volumeSpikeRatio != null && input.volumeSpikeRatio > 2.5) {
    risk += 8;
  }
  const shortBear = (input.shortTermDirection || "").toLowerCase() === "bearish";
  if (shortBear) risk += 6;
  const riskScore = Math.round(clamp(risk, 5, 95));

  // Conviction: coverage + agreement
  const available = comps.filter((c) => c.note != null || c.score !== 50).length;
  const coverage = clamp(available / comps.length, 0.25, 1);
  const spread =
    Math.max(...comps.map((c) => c.score)) - Math.min(...comps.map((c) => c.score));
  const agreement = clamp(1 - spread / 100, 0.2, 1);
  const convictionScore = Math.round(clamp(coverage * 55 + agreement * 45, 15, 95));

  const signed = clamp((opportunityScore - 50) / 50, -1, 1);
  const action: IntelligenceAction =
    opportunityScore >= 68 && riskScore < 72
      ? "buy"
      : opportunityScore <= 38 || (opportunityScore < 48 && riskScore > 70)
        ? "sell"
        : "hold";

  const categories = assignCategories({
    opportunityScore,
    convictionScore,
    riskScore,
    upsidePct,
    valuationScore: valuation.score,
    return1yPct: input.return1yPct,
    return1mPct: input.return1mPct,
    maxDrawdown1yPct: input.maxDrawdown1yPct,
    technicalsScore: technicals.score,
    daysToEarnings: input.daysToEarnings,
    volumeSpikeRatio: input.volumeSpikeRatio,
    hasUnusualNews: input.hasUnusualNews,
    recentDevelopmentCount: input.recentDevelopmentCount,
  });

  const keyReason =
    comps
      .slice()
      .sort((a, b) => b.score * b.weight - a.score * a.weight)[0]?.note ||
    comps.slice().sort((a, b) => b.score - a.score)[0]?.label ||
    "Mixed signals across available data";

  return {
    opportunityScore,
    riskScore,
    convictionScore,
    breakdown,
    categories,
    action,
    score: signed,
    confidence: clamp(convictionScore / 100, 0.2, 0.95),
    keyReason,
    potentialUpsidePct: upsidePct,
  };
}

export function assignCategories(input: {
  opportunityScore: number;
  convictionScore: number;
  riskScore: number;
  upsidePct: number | null;
  valuationScore: number;
  return1yPct: number | null;
  return1mPct: number | null;
  maxDrawdown1yPct: number | null;
  technicalsScore: number;
  daysToEarnings: number | null;
  volumeSpikeRatio: number | null;
  hasUnusualNews: boolean;
  recentDevelopmentCount: number;
}): OpportunityCategory[] {
  const cats: OpportunityCategory[] = [];

  if (input.opportunityScore >= 72 && input.convictionScore >= 65) {
    cats.push("high_conviction");
  }
  if (input.valuationScore >= 65 && (input.upsidePct ?? 0) >= 8) {
    cats.push("undervalued");
  }
  if (
    (input.return1mPct ?? 0) > 6 &&
    input.technicalsScore >= 60 &&
    (input.return1yPct ?? 0) > 0
  ) {
    cats.push("momentum");
  }
  if (
    (input.daysToEarnings != null && input.daysToEarnings <= 30) ||
    input.recentDevelopmentCount >= 2
  ) {
    cats.push("catalyst_plays");
  }
  if ((input.maxDrawdown1yPct ?? 0) <= -25 && (input.upsidePct ?? 0) > 5) {
    cats.push("beaten_down");
  }
  if (
    (input.volumeSpikeRatio != null && input.volumeSpikeRatio >= 2.2) ||
    input.hasUnusualNews ||
    ((input.return1mPct ?? 0) <= -12 && input.recentDevelopmentCount > 0)
  ) {
    cats.push("something_happening");
  }

  return cats;
}
