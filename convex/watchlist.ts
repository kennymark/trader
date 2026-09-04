import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getUserId, requireUserId } from "./users";
import type { Doc } from "./_generated/dataModel";

function toApi(doc: Doc<"watchlistItems">) {
  return {
    id: doc._id as string,
    symbol: doc.symbol,
    displayName: doc.displayName,
    sortOrder: doc.sortOrder,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

/** Null means "not signed in", which the client turns into guest mode. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.symbol.localeCompare(b.symbol));
    return rows.map(toApi);
  },
});

export const add = mutation({
  args: { symbol: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, { symbol, displayName }) => {
    const userId = await requireUserId(ctx);
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) throw new Error("symbol required");

    const existing = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user_symbol", (q) => q.eq("userId", userId).eq("symbol", ticker))
      .first();
    if (existing) return toApi(existing);

    const count = (
      await ctx.db
        .query("watchlistItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).length;

    const id = await ctx.db.insert("watchlistItems", {
      userId,
      symbol: ticker,
      displayName: displayName ?? null,
      sortOrder: count,
      createdAt: Date.now(),
    });
    const doc = await ctx.db.get(id);
    return toApi(doc!);
  },
});

export const remove = mutation({
  args: { id: v.id("watchlistItems") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (doc && doc.userId === userId) await ctx.db.delete(id);
    return { ok: true };
  },
});

/** Used after sign-in to fold a guest's local list into the account. */
export const sync = mutation({
  args: { symbols: v.array(v.string()) },
  handler: async (ctx, { symbols }) => {
    const userId = await requireUserId(ctx);
    const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const saved: string[] = [];

    const existing = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const have = new Set(existing.map((r) => r.symbol));
    let order = existing.length;

    for (const symbol of wanted) {
      if (have.has(symbol)) continue;
      await ctx.db.insert("watchlistItems", {
        userId,
        symbol,
        displayName: null,
        sortOrder: order++,
        createdAt: Date.now(),
      });
      saved.push(symbol);
    }
    return { saved };
  },
});

/** Symbols only, for the intelligence paths. */
export const symbolsFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => r.symbol);
  },
});

export const rowsFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("watchlistItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.symbol.localeCompare(b.symbol));
    return rows.map((r) => ({ symbol: r.symbol, displayName: r.displayName }));
  },
});
