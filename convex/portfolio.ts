import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getUserId, requireUserId, isoOrNull } from "./users";
import type { Doc } from "./_generated/dataModel";

function connectionToApi(doc: Doc<"brokerConnections">) {
  return {
    id: doc._id as string,
    provider: doc.provider,
    label: doc.label,
    lastSyncedAt: isoOrNull(doc.lastSyncedAt),
    transactionCount: doc.transactionCount,
    holdingCount: doc.holdingCount,
    meta: (doc.meta ?? {}) as Record<string, unknown>,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function holdingToApi(doc: Doc<"portfolioHoldings">) {
  return {
    id: doc._id as string,
    provider: doc.provider,
    symbol: doc.symbol,
    displayName: doc.displayName,
    isin: doc.isin,
    quantity: doc.quantity,
    averageCost: doc.averageCost,
    costBasis: doc.costBasis,
    currency: doc.currency,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    price: null,
    marketValue: null,
    unrealizedPnl: null,
    weightPct: null,
  };
}

async function connectionFor(ctx: { db: any }, userId: string) {
  return await ctx.db
    .query("brokerConnections")
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", userId).eq("provider", "freetrade"),
    )
    .first();
}

export const freetrade = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return { connection: null, holdings: [] };
    const connection = await connectionFor(ctx, userId);
    if (!connection) return { connection: null, holdings: [] };
    const holdings = await ctx.db
      .query("portfolioHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return {
      connection: connectionToApi(connection),
      holdings: holdings.map(holdingToApi),
    };
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await connectionFor(ctx, userId);
    if (!connection) return { ok: true, deleted: false };

    for (const table of ["brokerTransactions", "portfolioHoldings"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(connection._id);
    return { ok: true, deleted: true };
  },
});

// --- internal helpers used by the Node actions ---

export const getConnection = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const connection = await connectionFor(ctx, userId);
    return connection ? connectionToApi(connection) : null;
  },
});

export const listHoldings = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("portfolioHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(holdingToApi);
  },
});

/** Raw transactions for the P&L, market-compare and what-if computations. */
export const listTransactions = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("brokerTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      externalId: r.externalId,
      type: r.type,
      side: r.side,
      symbol: r.symbol,
      isin: r.isin,
      title: r.title,
      account: r.account,
      quantity: r.quantity,
      price: r.price,
      totalAmount: r.totalAmount,
      currency: r.currency,
      tradedAt: r.tradedAt,
      raw: (r.raw ?? {}) as Record<string, string>,
    }));
  },
});

export const ensureConnection = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await connectionFor(ctx, userId);
    if (existing) return existing._id;
    return await ctx.db.insert("brokerConnections", {
      userId,
      provider: "freetrade",
      label: "Freetrade",
      lastSyncedAt: null,
      transactionCount: 0,
      holdingCount: 0,
      meta: {},
      createdAt: Date.now(),
    });
  },
});

/** An import replaces whatever the previous one wrote. */
export const clearTransactions = internalMutation({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, { connectionId }) => {
    const rows = await ctx.db
      .query("brokerTransactions")
      .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

export const clearHoldings = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("portfolioHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

const txArg = v.object({
  externalId: v.union(v.string(), v.null()),
  type: v.string(),
  side: v.union(v.string(), v.null()),
  symbol: v.union(v.string(), v.null()),
  isin: v.union(v.string(), v.null()),
  title: v.union(v.string(), v.null()),
  account: v.union(v.string(), v.null()),
  quantity: v.union(v.number(), v.null()),
  price: v.union(v.number(), v.null()),
  totalAmount: v.union(v.number(), v.null()),
  currency: v.union(v.string(), v.null()),
  tradedAt: v.union(v.number(), v.null()),
  raw: v.any(),
});

export const insertTransactions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    rows: v.array(txArg),
  },
  handler: async (ctx, { userId, connectionId, rows }) => {
    for (const row of rows) {
      await ctx.db.insert("brokerTransactions", {
        userId,
        connectionId,
        provider: "freetrade",
        ...row,
        createdAt: Date.now(),
      });
    }
    return rows.length;
  },
});

export const insertHoldings = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    rows: v.array(
      v.object({
        symbol: v.string(),
        displayName: v.union(v.string(), v.null()),
        isin: v.union(v.string(), v.null()),
        quantity: v.number(),
        averageCost: v.union(v.number(), v.null()),
        costBasis: v.union(v.number(), v.null()),
        currency: v.string(),
      }),
    ),
  },
  handler: async (ctx, { userId, connectionId, rows }) => {
    for (const row of rows) {
      await ctx.db.insert("portfolioHoldings", {
        userId,
        connectionId,
        provider: "freetrade",
        ...row,
        updatedAt: Date.now(),
      });
    }
  },
});

export const finishImport = internalMutation({
  args: {
    connectionId: v.id("brokerConnections"),
    transactionCount: v.number(),
    holdingCount: v.number(),
    meta: v.any(),
  },
  handler: async (ctx, { connectionId, transactionCount, holdingCount, meta }) => {
    await ctx.db.patch(connectionId, {
      lastSyncedAt: Date.now(),
      transactionCount,
      holdingCount,
      meta,
    });
  },
});

/** Adds any holdings missing from the watchlist, without disturbing order. */
export const syncWatchlistSymbols = internalMutation({
  args: {
    userId: v.string(),
    entries: v.array(
      v.object({ symbol: v.string(), displayName: v.union(v.string(), v.null()) }),
    ),
  },
  handler: async (ctx, { userId, entries }) => {
    const existing = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const have = new Set(existing.map((r) => r.symbol));
    let order = existing.length;
    const saved: string[] = [];

    for (const entry of entries) {
      if (have.has(entry.symbol)) continue;
      await ctx.db.insert("watchlistItems", {
        userId,
        symbol: entry.symbol,
        displayName: entry.displayName,
        sortOrder: order++,
        createdAt: Date.now(),
      });
      saved.push(entry.symbol);
    }
    return saved;
  },
});
