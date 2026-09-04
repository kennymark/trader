import { desc, eq } from "drizzle-orm";
import type {
  IntelligencePrediction,
  PredictionDashboard,
  PredictionHorizon,
  OpportunityCard,
} from "@trader/shared";
import { db } from "../../db/index.js";
import {
  intelligencePredictions,
  opportunitySnapshots,
} from "../../db/schema.js";
import { getQuotes } from "../yahoo.js";

const HORIZONS: PredictionHorizon[] = [7, 30, 90, 180, 365];

function id() {
  return crypto.randomUUID();
}

export async function persistOpportunitySnapshots(
  userId: string,
  cards: OpportunityCard[],
) {
  if (!cards.length) return;
  const now = new Date();
  await db.insert(opportunitySnapshots).values(
    cards.map((c) => ({
      id: id(),
      userId,
      symbol: c.symbol,
      opportunityScore: c.opportunityScore,
      riskScore: c.riskScore,
      convictionScore: c.convictionScore,
      price: c.price != null ? String(c.price) : null,
      payload: c as unknown as Record<string, unknown>,
      createdAt: now,
    })),
  );
}

export async function recordPredictionsFromHunt(
  userId: string,
  cards: OpportunityCard[],
) {
  // Track high-signal names: buys, high opportunity, or top of the Hunt ranking.
  const ranked = [...cards].sort((a, b) => b.opportunityScore - a.opportunityScore);
  const actionable = ranked.filter(
    (c, i) => c.action === "buy" || c.opportunityScore >= 60 || i < 5,
  );
  if (!actionable.length) return;

  const now = new Date();
  const recent = await db
    .select()
    .from(intelligencePredictions)
    .where(eq(intelligencePredictions.userId, userId))
    .orderBy(desc(intelligencePredictions.predictedAt))
    .limit(100);

  for (const c of actionable) {
    const prior = recent.find((r) => r.symbol === c.symbol);
    if (prior && now.getTime() - prior.predictedAt.getTime() < 24 * 60 * 60_000) {
      continue;
    }

    const evaluations = HORIZONS.map((horizonDays) => ({
      horizonDays,
      dueAt: new Date(now.getTime() + horizonDays * 24 * 60 * 60_000).toISOString(),
      evaluatedAt: null as string | null,
      priceAtEval: null as number | null,
      returnPct: null as number | null,
      hitTarget: null as boolean | null,
    }));

    await db.insert(intelligencePredictions).values({
      id: id(),
      userId,
      symbol: c.symbol,
      thesis: c.rationale || c.keyReason,
      action: c.action,
      opportunityScore: c.opportunityScore,
      convictionScore: c.convictionScore,
      priceAtPrediction: c.price != null ? String(c.price) : null,
      targetPrice: c.targetPrice != null ? String(c.targetPrice) : null,
      predictedAt: now,
      evaluations,
    });
  }
}

export async function loadPriorScores(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(opportunitySnapshots)
    .where(eq(opportunitySnapshots.userId, userId))
    .orderBy(desc(opportunitySnapshots.createdAt))
    .limit(200);

  const map = new Map<string, number>();
  // Second-most-recent style: skip first occurrence per symbol (latest), keep next
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

export async function evaluateDuePredictions(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(intelligencePredictions)
    .where(eq(intelligencePredictions.userId, userId));

  const now = new Date();
  let updated = 0;

  for (const row of rows) {
    const evals = row.evaluations || [];
    const due = evals.filter(
      (e) => !e.evaluatedAt && new Date(e.dueAt).getTime() <= now.getTime(),
    );
    if (!due.length) continue;

    const quotes = await getQuotes([row.symbol]);
    const price = quotes[0]?.price ?? null;
    const entry = row.priceAtPrediction != null ? Number(row.priceAtPrediction) : null;
    const target = row.targetPrice != null ? Number(row.targetPrice) : null;

    const next = evals.map((e) => {
      if (e.evaluatedAt || new Date(e.dueAt).getTime() > now.getTime()) return e;
      const returnPct =
        price != null && entry != null && entry > 0
          ? ((price - entry) / entry) * 100
          : null;
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

    await db
      .update(intelligencePredictions)
      .set({ evaluations: next })
      .where(eq(intelligencePredictions.id, row.id));
    updated++;
  }

  return updated;
}

export async function getPredictionDashboard(
  userId: string,
): Promise<PredictionDashboard> {
  await evaluateDuePredictions(userId);

  const rows = await db
    .select()
    .from(intelligencePredictions)
    .where(eq(intelligencePredictions.userId, userId))
    .orderBy(desc(intelligencePredictions.predictedAt))
    .limit(100);

  const predictions: IntelligencePrediction[] = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    thesis: r.thesis,
    action: r.action as IntelligencePrediction["action"],
    opportunityScore: r.opportunityScore,
    convictionScore: r.convictionScore,
    priceAtPrediction: r.priceAtPrediction != null ? Number(r.priceAtPrediction) : null,
    targetPrice: r.targetPrice != null ? Number(r.targetPrice) : null,
    predictedAt: r.predictedAt.toISOString(),
    evaluations: r.evaluations,
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
    const hReturns = pts
      .map((e) => e.returnPct)
      .filter((x): x is number => x != null);
    return {
      horizonDays,
      count: pts.length,
      avgReturnPct: hReturns.length
        ? Math.round((hReturns.reduce((a, b) => a + b, 0) / hReturns.length) * 10) / 10
        : null,
      hitRatePct: pts.length
        ? Math.round((hHits.length / pts.length) * 1000) / 10
        : null,
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
