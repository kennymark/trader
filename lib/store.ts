import type { OpportunityCard, PortfolioHolding } from "@trader/shared";

/**
 * Persistence seam for the intelligence layer.
 *
 * The scoring and prediction code is pure and knows nothing about Convex; the
 * Convex actions pass in an implementation backed by `ctx.runQuery` and
 * `ctx.runMutation`. Tests pass an in-memory one.
 */

export type PredictionEvaluation = {
  horizonDays: number;
  dueAt: string;
  evaluatedAt: string | null;
  priceAtEval: number | null;
  returnPct: number | null;
  hitTarget: boolean | null;
};

export type StoredPrediction = {
  id: string;
  symbol: string;
  thesis: string;
  action: string;
  opportunityScore: number;
  convictionScore: number;
  priceAtPrediction: number | null;
  targetPrice: number | null;
  /** Epoch milliseconds. */
  predictedAt: number;
  evaluations: PredictionEvaluation[];
};

export type NewPrediction = Omit<StoredPrediction, "id">;

export type NewSnapshot = {
  symbol: string;
  opportunityScore: number;
  riskScore: number;
  convictionScore: number;
  price: number | null;
  payload: Record<string, unknown>;
};

export type IntelligenceStore = {
  /** Freetrade holdings, used to score portfolio health. */
  listHoldings(userId: string): Promise<PortfolioHolding[]>;
  /** Most recent snapshots first. */
  recentSnapshots(
    userId: string,
    limit: number,
  ): Promise<Array<{ symbol: string; opportunityScore: number }>>;
  insertSnapshots(userId: string, rows: NewSnapshot[]): Promise<void>;
  /** Most recent predictions first. */
  recentPredictions(userId: string, limit: number): Promise<StoredPrediction[]>;
  insertPrediction(userId: string, row: NewPrediction): Promise<void>;
  allPredictions(userId: string): Promise<StoredPrediction[]>;
  updateEvaluations(id: string, evaluations: PredictionEvaluation[]): Promise<void>;
};

export function snapshotRowsFor(cards: OpportunityCard[]): NewSnapshot[] {
  return cards.map((c) => ({
    symbol: c.symbol,
    opportunityScore: c.opportunityScore,
    riskScore: c.riskScore,
    convictionScore: c.convictionScore,
    price: c.price ?? null,
    payload: c as unknown as Record<string, unknown>,
  }));
}
