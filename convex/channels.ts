import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./users";
import type { Doc } from "./_generated/dataModel";

function toApi(doc: Doc<"notificationChannels">) {
  return {
    id: doc._id as string,
    symbol: doc.symbol,
    type: doc.type,
    label: doc.label,
    config: (doc.config ?? {}) as Record<string, unknown>,
    enabled: doc.enabled,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("notificationChannels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map(toApi);
  },
});

export const create = mutation({
  args: {
    type: v.string(),
    label: v.string(),
    config: v.any(),
    symbol: v.string(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const id = await ctx.db.insert("notificationChannels", {
      userId,
      symbol: args.symbol.trim().toUpperCase() || null,
      type: args.type,
      label: args.label,
      config: args.config ?? {},
      enabled: args.enabled ?? true,
      createdAt: Date.now(),
    });
    return toApi((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("notificationChannels"),
    label: v.optional(v.string()),
    config: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    symbol: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Not found");

    const next: Record<string, unknown> = {};
    if (patch.label !== undefined) next.label = patch.label;
    if (patch.config !== undefined) next.config = patch.config;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.symbol !== undefined) next.symbol = patch.symbol.trim().toUpperCase() || null;

    await ctx.db.patch(id, next);
    return toApi((await ctx.db.get(id))!);
  },
});

export const remove = mutation({
  args: { id: v.id("notificationChannels") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (doc && doc.userId === userId) await ctx.db.delete(id);
    return { ok: true };
  },
});

/** Mint a one-time token the Telegram bot exchanges for a channel. */
export const createTelegramLink = mutation({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }) => {
    const userId = await requireUserId(ctx);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresInMinutes = 15;
    const ticker = symbol.trim().toUpperCase();
    await ctx.db.insert("telegramLinkTokens", {
      userId,
      symbol: ticker || null,
      token,
      expiresAt: Date.now() + expiresInMinutes * 60_000,
      createdAt: Date.now(),
    });
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "YourStockAlertsBot";
    return {
      token,
      deepLink: `https://t.me/${botUsername}?start=${token}`,
      expiresInMinutes,
      symbol: ticker,
    };
  },
});

// --- internal, used by the Telegram webhook and the alert cycle ---

export const redeemTelegramToken = internalMutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, { token, chatId }) => {
    const link = await ctx.db
      .query("telegramLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!link || link.expiresAt < Date.now()) return { linked: false };

    await ctx.db.insert("notificationChannels", {
      userId: link.userId,
      symbol: link.symbol,
      type: "telegram",
      label: link.symbol ? `Telegram · ${link.symbol}` : "Telegram",
      config: { chatId },
      enabled: true,
      createdAt: Date.now(),
    });
    await ctx.db.delete(link._id);
    return { linked: true };
  },
});

export const enabledForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("notificationChannels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((r) => r.enabled)
      .map((r) => ({
        id: r._id as string,
        type: r.type,
        config: (r.config ?? {}) as Record<string, unknown>,
      }));
  },
});
