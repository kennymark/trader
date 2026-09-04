import type {
  IntelligencePrediction,
  PredictionDashboard,
  PredictionHorizon,
  OpportunityCard,
} from "@trader/shared";
import type {
  IntelligenceStore,
  PredictionEvaluation,
  StoredPrediction,
} from "../store";
import { snapshotRowsFor } from "../store";
import { getQuotes } from "../yahoo";

const HORIZONS: PredictionHorizon[] = [7, 30, 90, 180, 365];

export async function persistOpportunitySnapshots(
  store: IntelligenceStore,
  userId: string,
  cards: OpportunityCard[],
) {
  if (!cards.length) return;
  await store.insertSnapshots(userId, snapshotRowsFor(cards));
}

export async function recordPredictionsFromHunt(
  store: IntelligenceStore,
  userId: string,
  cards: OpportunityCard[],
) {
  // Track high-signal names: buys, high opportunity, or top of the Hunt ranking.
  const ranked = [...cards].sort((a, b) => b.opportunityScore - a.opportunityScore);
  const actionable = ranked.filter(
    (c, i) => c.action === "buy" || c.opportunityScore >= 60 || i < 5,
  );
  if (!actionable.length) return;

  const now = Date.now();
  const recent = await store.recentPredictions(userId, 100);

  for (const c of actionable) {
    const prior = recent.find((r) => r.symbol === c.symbol);
    if (prior && now - prior.predictedAt < 24 * 60 * 60_000) {
      continue;
    }

    const evaluations: PredictionEvaluation[] = HORIZONS.map((horizonDays) => ({
      horizonDays,
      dueAt: new Date(now + horizonDays * 24 * 60 * 60_000).toISOString(),
      evaluatedAt: null,
      priceAtEval: null,
      returnPct: null,
      hitTarget: null,
    }));

    await store.insertPrediction(userId, {
      symbol: c.symbol,
      thesis: c.rationale || c.keyReason,
      action: c.action,
      opportunityScore: c.opportunityScore,
      convictionScore: c.convictionScore,
      priceAtPrediction: c.price ?? null,
      targetPrice: c.targetPrice ?? null,
      predictedAt: now,
      evaluations,
    });
  }
}

/**
 * Second-most-recent score per symbol, so the Hunt can show which way a name moved.
 */
export async function loadPriorScores(
  store: IntelligenceStore,
  userId: string,
): Promise<Map<string, number>> {
  const rows = await store.recentSnapshots(userId, 200);

  const map = new Map<string, number>();
  const seen = new Set<string>();
  const prior = new Set<string>();
  for (const row of rows) {
    if (!seen.has(row.symbol)) {
      seen.add(row.symbol);
      continue;
    }
    if (!prior.has(row.symbol)) {
      map.set(row.symbol, row.opportunityScore);
      prior.add(row.symbol);
    }
  }
  return map;
}

/** Pure: fold a due evaluation forward given the price observed at evaluation time. */
export function applyEvaluation(
  row: Pick<StoredPrediction, "action" | "priceAtPrediction" | "targetPrice" | "evaluations">,
  price: number | null,
  now = new Date(),
): PredictionEvaluation[] {
  const entry = row.priceAtPrediction;
  const target = row.targetPrice;
  return row.evaluations.map((e) => {
    if (e.evaluatedAt || new Date(e.dueAt).getTime() > now.getTime()) return e;
    const returnPct =
      price != null && entry != null && entry > 0 ? ((price - entry) / entry) * 100 : null;
    const hitTarget =
      price != null && target != null
        ? row.action === "sell"
          ? price <= target
          : price >= target
        : returnPct != null
          ? returnPct > 0
          : null;
    return {
      ...e,
      evaluatedAt: now.toISOString(),
      priceAtEval: price,
      returnPct: returnPct != null ? Math.round(returnPct * 10) / 10 : null,
      hitTarget,
    };
  });
}

export async function evaluateDuePredictions(
  store: IntelligenceStore,
  userId: string,
): Promise<number> {
  const rows = await store.allPredictions(userId);
  const now = new Date();
  let updated = 0;

  for (const row of rows) {
    const due = row.evaluations.filter(
      (e) => !e.evaluatedAt && new Date(e.dueAt).getTime() <= now.getTime(),
    );
    if (!due.length) continue;

    const quotes = await getQuotes([row.symbol]);
    const price = quotes[0]?.price ?? null;
    await store.updateEvaluations(row.id, applyEvaluation(row, price, now));
    updated++;
  }

  return updated;
}

/** Pure: roll stored predictions up into the dashboard shape. */
export function summarizePredictions(rows: StoredPrediction[]): PredictionDashboard {
  const predictions: IntelligencePrediction[] = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    thesis: r.thesis,
    action: r.action as IntelligencePrediction["action"],
    opportunityScore: r.opportunityScore,
    convictionScore: r.convictionScore,
    priceAtPrediction: r.priceAtPrediction,
    targetPrice: r.targetPrice,
    predictedAt: new Date(r.predictedAt).toISOString(),
    evaluations: r.evaluations as IntelligencePrediction["evaluations"],
  }));

  const evaluatedPoints = predictions.flatMap((p) =>
    p.evaluations.filter((e) => e.evaluatedAt != null),
  );
  const hits = evaluatedPoints.filter((e) => e.hitTarget === true);
  const returns = evaluatedPoints
    .map((e) => e.returnPct)
    .filter((x): x is number => x != null);

  const byHorizon = HORIZONS.map((horizonDays) => {
    const pts = evaluatedPoints.filter((e) => e.horizonDays === horizonDays);
    const hHits = pts.filter((e) => e.hitTarget === true);
    const hReturns = pts.map((e) => e.returnPct).filter((x): x is number => x != null);
    return {
      horizonDays,
      count: pts.length,
      avgReturnPct: hReturns.length
        ? Math.round((hReturns.reduce((a, b) => a + b, 0) / hReturns.length) * 10) / 10
        : null,
      hitRatePct: pts.length ? Math.round((hHits.length / pts.length) * 1000) / 10 : null,
    };
  });

  return {
    total: predictions.length,
    evaluated: evaluatedPoints.length,
    hitRatePct: evaluatedPoints.length
      ? Math.round((hits.length / evaluatedPoints.length) * 1000) / 10
      : null,
    avgReturnPct: returns.length
      ? Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 10) / 10
      : null,
    byHorizon,
    predictions,
  };
}

export async function getPredictionDashboard(
  store: IntelligenceStore,
  userId: string,
): Promise<PredictionDashboard> {
  await evaluateDuePredictions(store, userId);
  const rows = await store.recentPredictions(userId, 100);
  return summarizePredictions(rows);
}
