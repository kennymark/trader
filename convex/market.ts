"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { computeAnalytics } from "../lib/analytics";
import { getHistory, getQuotes, searchSymbols } from "../lib/yahoo";

/**
 * Public market data. These hit Yahoo Finance, which needs Node builtins, so the
 * whole file runs in the Node runtime and may contain only actions.
 */

const historyRange = v.union(
  v.literal("1d"),
  v.literal("7d"),
  v.literal("1m"),
  v.literal("3m"),
  v.literal("1y"),
  v.literal("5y"),
  v.literal("max"),
);

export const search = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const q = query.trim();
    if (q.length < 1) return [];
    return await searchSymbols(q);
  },
});

export const quotes = action({
  args: { symbols: v.array(v.string()) },
  handler: async (_ctx, { symbols }) => {
    const list = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (list.length === 0) return [];
    return await getQuotes(list);
  },
});

export const history = action({
  args: { symbol: v.string(), range: historyRange },
  handler: async (_ctx, { symbol, range }) => {
    const bars = await getHistory(symbol, range);
    return { symbol: symbol.toUpperCase(), range, bars };
  },
});

export const analytics = action({
  args: {
    symbol: v.string(),
    range: historyRange,
    amount: v.number(),
    dipPct: v.number(),
  },
  handler: async (_ctx, { symbol, range, amount, dipPct }) => {
    const bars = await getHistory(symbol, range);
    return computeAnalytics(symbol.toUpperCase(), range, bars, amount, dipPct);
  },
});
