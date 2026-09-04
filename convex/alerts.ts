import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId, isoOrNull } from "./users";
import type { Doc } from "./_generated/dataModel";

function ruleToApi(doc: Doc<"alertRules">) {
  return {
    id: doc._id as string,
    symbol: doc.symbol,
    kind: doc.kind,
    threshold: doc.threshold,
    baseline: doc.baseline,
    baselineWindowDays: doc.baselineWindowDays,
    channelIds: doc.channelIds,
    cooldownMinutes: doc.cooldownMinutes,
    enabled: doc.enabled,
    lastTriggeredAt: isoOrNull(doc.lastTriggeredAt),
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("alertRules")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map(ruleToApi);
  },
});

export const create = mutation({
  args: {
    symbol: v.string(),
    kind: v.string(),
    threshold: v.number(),
    baseline: v.optional(v.string()),
    baselineWindowDays: v.optional(v.union(v.number(), v.null())),
    channelIds: v.optional(v.array(v.string())),
    cooldownMinutes: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const id = await ctx.db.insert("alertRules", {
      userId,
      symbol: args.symbol.trim().toUpperCase(),
      kind: args.kind,
      threshold: args.threshold,
      baseline: args.baseline ?? "prev_close",
      baselineWindowDays: args.baselineWindowDays ?? null,
      channelIds: args.channelIds ?? [],
      cooldownMinutes: args.cooldownMinutes ?? 60,
      enabled: args.enabled ?? true,
      lastTriggeredAt: null,
      createdAt: Date.now(),
    });
    return ruleToApi((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("alertRules"),
    kind: v.optional(v.string()),
    threshold: v.optional(v.number()),
    baseline: v.optional(v.string()),
    baselineWindowDays: v.optional(v.union(v.number(), v.null())),
    channelIds: v.optional(v.array(v.string())),
    cooldownMinutes: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Not found");

    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) next[key] = value;
    }
    await ctx.db.patch(id, next);
    return ruleToApi((await ctx.db.get(id))!);
  },
});

export const remove = mutation({
  args: { id: v.id("alertRules") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (doc && doc.userId === userId) await ctx.db.delete(id);
    return { ok: true };
  },
});

export const events = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("alertEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 100).map((doc) => ({
      id: doc._id as string,
      ruleId: doc.ruleId,
      symbol: doc.symbol,
      price: doc.price,
      message: doc.message,
      channels: doc.channels,
      status: doc.status,
      createdAt: new Date(doc.createdAt).toISOString(),
    }));
  },
});

// --- internal, used by the alert cycle ---

export const enabledRules = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("alertRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    return rows.map((r) => ({
      id: r._id as string,
      userId: r.userId,
      symbol: r.symbol,
      kind: r.kind,
      threshold: r.threshold,
      baseline: r.baseline,
      baselineWindowDays: r.baselineWindowDays,
      channelIds: r.channelIds,
      cooldownMinutes: r.cooldownMinutes,
      lastTriggeredAt: r.lastTriggeredAt,
    }));
  },
});

export const recordFiring = internalMutation({
  args: {
    ruleId: v.id("alertRules"),
    userId: v.string(),
    symbol: v.string(),
    price: v.number(),
    message: v.string(),
    channels: v.array(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("alertEvents", {
      userId: args.userId,
      ruleId: args.ruleId as string,
      symbol: args.symbol,
      price: args.price,
      message: args.message,
      channels: args.channels,
      status: args.status,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.ruleId, { lastTriggeredAt: Date.now() });
  },
});

export const recentEvents = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("alertEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((doc) => ({
      id: doc._id as string,
      ruleId: doc.ruleId,
      symbol: doc.symbol,
      price: doc.price,
      message: doc.message,
      channels: doc.channels,
      status: doc.status,
      createdAt: new Date(doc.createdAt).toISOString(),
    }));
  },
});
