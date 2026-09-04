import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getUserId, requireUserId } from "./users";
import { normalizePreferences, type UserPreferences } from "@trader/shared";

/**
 * One row per user, read on nearly every screen. A guest, or a user who has
 * never opened Settings, gets the defaults rather than a null the callers all
 * have to handle.
 */
async function readFor(ctx: QueryCtx, userId: string | null): Promise<UserPreferences> {
  if (!userId) return normalizePreferences(null);
  const row = await ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return normalizePreferences(row);
}

export const get = query({
  args: {},
  handler: async (ctx): Promise<UserPreferences> => readFor(ctx, await getUserId(ctx)),
});

export const forUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<UserPreferences> => readFor(ctx, userId),
});

export const update = mutation({
  args: {
    defaultChartRange: v.optional(v.string()),
    defaultWorkTab: v.optional(v.string()),
    quoteRefreshSeconds: v.optional(v.number()),
    huntAiRationales: v.optional(v.boolean()),
    alertDefaultBaseline: v.optional(v.string()),
    alertDefaultWindowDays: v.optional(v.number()),
    alertDefaultCooldownMinutes: v.optional(v.number()),
  },
  handler: async (ctx, patch): Promise<UserPreferences> => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Normalize before writing, so a rejected value never reaches the table
    // and the caller sees what was actually stored.
    const next = normalizePreferences({
      ...normalizePreferences(existing),
      ...(patch as Partial<UserPreferences>),
    });

    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("userPreferences", { userId, ...next, updatedAt: Date.now() });
    }
    return next;
  },
});

/** Restores every default in one action, rather than field by field. */
export const reset = mutation({
  args: {},
  handler: async (ctx): Promise<UserPreferences> => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return normalizePreferences(null);
  },
});
