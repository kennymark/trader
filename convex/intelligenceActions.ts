"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./users";
import type { Id } from "./_generated/dataModel";
import {
  buildIntelligence,
  buildSymbolIntelligence,
  runScenarioSimulator,
} from "../lib/intelligence";
import { evaluateDuePredictions, getPredictionDashboard } from "../lib/intelligence/predictions";
import { defaultAssumptionsFromFundamentals } from "../lib/intelligence/scenarios";
import { isDeepSeekEnabled } from "../lib/deepseek";
import { getFundamentals, getQuotes } from "../lib/yahoo";
import type { IntelligenceStore } from "../lib/store";
import type {
  IntelligenceResponse,
  PortfolioHolding,
  UserPreferences,
} from "@trader/shared";

/** Binds the pure intelligence layer to Convex storage. */
function storeFor(ctx: any): IntelligenceStore {
  return {
    listHoldings: async (userId) =>
      (await ctx.runQuery(internal.portfolio.listHoldings, { userId })) as PortfolioHolding[],
    recentSnapshots: async (userId, limit) =>
      await ctx.runQuery(internal.intelligence.recentSnapshots, { userId, limit }),
    insertSnapshots: async (userId, rows) => {
      await ctx.runMutation(internal.intelligence.insertSnapshots, { userId, rows });
    },
    recentPredictions: async (userId, limit) =>
      await ctx.runQuery(internal.intelligence.recentPredictions, { userId, limit }),
    insertPrediction: async (userId, row) => {
      await ctx.runMutation(internal.intelligence.insertPrediction, { userId, ...row });
    },
    allPredictions: async (userId) =>
      await ctx.runQuery(internal.intelligence.allPredictions, { userId }),
    updateEvaluations: async (id, evaluations) => {
      await ctx.runMutation(internal.intelligence.updateEvaluations, {
        id: id as Id<"intelligencePredictions">,
        evaluations,
      });
    },
  };
}

async function resolveSymbols(
  ctx: any,
  userId: string,
  requested: string[],
): Promise<{ symbols: string[]; source: "watchlist" | "symbols" }> {
  if (requested.length > 0) return { symbols: requested, source: "symbols" };
  const symbols = (await ctx.runQuery(internal.watchlist.symbolsFor, {
    userId,
  })) as string[];
  return { symbols, source: "watchlist" };
}

export const hunt = action({
  args: { symbols: v.optional(v.array(v.string())) },
  handler: async (ctx, { symbols }): Promise<IntelligenceResponse> => {
    const userId = await requireUserId(ctx);
    const requested = (symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const resolved = await resolveSymbols(ctx, userId, requested);
    const prefs: UserPreferences = await ctx.runQuery(internal.preferences.forUser, {
      userId,
    });

    if (resolved.symbols.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        source: resolved.source,
        aiEnabled: isDeepSeekEnabled() && prefs.huntAiRationales,
        opportunities: [],
        feed: [],
        catalysts: [],
        portfolio: null,
        recommendations: [],
      };
    }

    return await buildIntelligence(resolved.symbols, resolved.source, {
      userId,
      store: storeFor(ctx),
      aiRationales: prefs.huntAiRationales,
    });
  },
});

export const forSymbol = action({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }) => {
    await requireUserId(ctx);
    return await buildSymbolIntelligence(symbol.trim().toUpperCase());
  },
});

export const predictions = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await getPredictionDashboard(storeFor(ctx), userId);
  },
});

export const portfolioHealth = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const store = storeFor(ctx);
    const holdingSymbols = (await store.listHoldings(userId)).map((h) => h.symbol);
    const resolved =
      holdingSymbols.length > 0
        ? { symbols: holdingSymbols, source: "symbols" as const }
        : await resolveSymbols(ctx, userId, []);

    if (resolved.symbols.length === 0) {
      return {
        healthScore: 50,
        holdingsProxy: "watchlist",
        note: "Import a Freetrade activity CSV or add watchlist symbols to score portfolio health.",
        symbolCount: 0,
        strongest: [],
        weakest: [],
        risks: [],
        actions: [],
      };
    }

    const result = await buildIntelligence(resolved.symbols, resolved.source, {
      userId,
      persist: false,
      store,
    });
    return result.portfolio;
  },
});

export const catalysts = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const resolved = await resolveSymbols(ctx, userId, []);
    if (resolved.symbols.length === 0) {
      return { generatedAt: new Date().toISOString(), catalysts: [] };
    }
    const result = await buildIntelligence(resolved.symbols, resolved.source, {
      userId,
      persist: false,
      store: storeFor(ctx),
    });
    return { generatedAt: result.generatedAt, catalysts: result.catalysts };
  },
});

export const scenarios = action({
  args: { symbol: v.string(), assumptions: v.optional(v.any()) },
  handler: async (ctx, { symbol, assumptions }) => {
    await requireUserId(ctx);
    const ticker = symbol.trim().toUpperCase();
    const [quotes, fundamentals] = await Promise.all([
      getQuotes([ticker]),
      getFundamentals(ticker),
    ]);
    const quote = quotes[0];
    const merged = {
      ...defaultAssumptionsFromFundamentals({
        trailingPe: fundamentals.trailingPe,
        forwardPe: fundamentals.forwardPe,
        profitMargins: fundamentals.profitMargins,
      }),
      ...(assumptions ?? {}),
    };
    return runScenarioSimulator({
      symbol: ticker,
      currentPrice: quote?.price ?? null,
      currency: quote?.currency,
      trailingEps: fundamentals.trailingEps,
      assumptions: merged,
    });
  },
});

/**
 * The record used to grow only when someone pressed Refresh, which made it a
 * log of visits rather than of calls. Once a day this scores every list the
 * way a refresh would — the 24h dedupe in recordPredictionsFromHunt means a
 * manual refresh the same day adds nothing twice — and grades whatever has
 * come due, so the track record fills in whether or not the app was opened.
 */
export const recordDaily = internalAction({
  args: {},
  handler: async (ctx): Promise<{ users: number; recorded: number; evaluated: number }> => {
    const userIds: string[] = await ctx.runQuery(internal.watchlist.userIdsWithSymbols, {});
    const store = storeFor(ctx);
    let recorded = 0;
    let evaluated = 0;

    for (const userId of userIds) {
      try {
        const symbols: string[] = await ctx.runQuery(internal.watchlist.symbolsFor, { userId });
        if (symbols.length === 0) continue;
        const prefs: UserPreferences = await ctx.runQuery(internal.preferences.forUser, {
          userId,
        });
        await buildIntelligence(symbols, "watchlist", {
          userId,
          store,
          aiRationales: prefs.huntAiRationales,
        });
        recorded++;
        evaluated += await evaluateDuePredictions(store, userId);
      } catch (err) {
        // One list failing must not stop the rest being recorded.
        console.error(`Daily record failed for user ${userId}`, err);
      }
    }

    return { users: userIds.length, recorded, evaluated };
  },
});
