import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Storage behind the intelligence layer. The scoring code itself is pure and
 * reaches these through the IntelligenceStore seam in lib/store.ts.
 */

export const recentSnapshots = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("opportunitySnapshots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((r) => ({ symbol: r.symbol, opportunityScore: r.opportunityScore }));
  },
});

export const insertSnapshots = internalMutation({
  args: {
    userId: v.string(),
    rows: v.array(
      v.object({
        symbol: v.string(),
        opportunityScore: v.number(),
        riskScore: v.number(),
        convictionScore: v.number(),
        price: v.union(v.number(), v.null()),
        payload: v.any(),
      }),
    ),
  },
  handler: async (ctx, { userId, rows }) => {
    for (const row of rows) {
      await ctx.db.insert("opportunitySnapshots", {
        userId,
        ...row,
        createdAt: Date.now(),
      });
    }
  },
});

const evaluationValidator = v.object({
  horizonDays: v.number(),
  dueAt: v.string(),
  evaluatedAt: v.union(v.string(), v.null()),
  priceAtEval: v.union(v.number(), v.null()),
  returnPct: v.union(v.number(), v.null()),
  hitTarget: v.union(v.boolean(), v.null()),
});

function predictionToApi(r: {
  _id: string;
  symbol: string;
  thesis: string;
  action: string;
  opportunityScore: number;
  convictionScore: number;
  priceAtPrediction: number | null;
  targetPrice: number | null;
  predictedAt: number;
  evaluations: unknown[];
}) {
  return {
    id: r._id as string,
    symbol: r.symbol,
    thesis: r.thesis,
    action: r.action,
    opportunityScore: r.opportunityScore,
    convictionScore: r.convictionScore,
    priceAtPrediction: r.priceAtPrediction,
    targetPrice: r.targetPrice,
    predictedAt: r.predictedAt,
    evaluations: r.evaluations as never[],
  };
}

export const recentPredictions = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("intelligencePredictions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map(predictionToApi as never);
  },
});

export const allPredictions = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("intelligencePredictions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(predictionToApi as never);
  },
});

export const insertPrediction = internalMutation({
  args: {
    userId: v.string(),
    symbol: v.string(),
    thesis: v.string(),
    action: v.string(),
    opportunityScore: v.number(),
    convictionScore: v.number(),
    priceAtPrediction: v.union(v.number(), v.null()),
    targetPrice: v.union(v.number(), v.null()),
    predictedAt: v.number(),
    evaluations: v.array(evaluationValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("intelligencePredictions", args);
  },
});

export const updateEvaluations = internalMutation({
  args: {
    id: v.id("intelligencePredictions"),
    evaluations: v.array(evaluationValidator),
  },
  handler: async (ctx, { id, evaluations }) => {
    await ctx.db.patch(id, { evaluations });
  },
});
