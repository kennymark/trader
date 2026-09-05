import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./users";
import type { Doc } from "./_generated/dataModel";

/**
 * A destination is a place messages reach you — an inbox, a Telegram chat, a
 * Twist thread. It belongs to the account, not to a stock: the same inbox is
 * the same inbox whatever the alert is about. Which rules use which
 * destination is decided on the rule.
 */
function toApi(doc: Doc<"notificationChannels">) {
  return {
    id: doc._id as string,
    type: doc.type,
    label: doc.label,
    config: (doc.config ?? {}) as Record<string, unknown>,
    enabled: doc.enabled,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

/** What makes two destinations the same place. */
function identityOf(type: string, config: Record<string, unknown>): string | null {
  if (type === "email") {
    const address = String(config.address ?? "").trim().toLowerCase();
    return address ? `email:${address}` : null;
  }
  if (type === "telegram") {
    const chatId = String(config.chatId ?? "").trim();
    return chatId ? `telegram:${chatId}` : null;
  }
  if (type === "twist") {
    const thread = String(config.conversationId ?? config.threadId ?? "").trim();
    return thread ? `twist:${thread}` : null;
  }
  return null;
}

/** The label a destination gets when the user hasn't written one. */
function defaultLabel(type: string, config: Record<string, unknown>): string {
  if (type === "email") return String(config.address ?? "") || "Email";
  if (type === "telegram") {
    const chatId = String(config.chatId ?? "");
    return chatId ? `Telegram chat ${chatId}` : "Telegram";
  }
  if (type === "twist") {
    const thread = String(config.conversationId ?? config.threadId ?? "");
    return thread ? `Twist thread ${thread}` : "Twist";
  }
  return type;
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
    label: v.optional(v.string()),
    config: v.any(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const config = (args.config ?? {}) as Record<string, unknown>;

    // The same place twice would just mean every alert arrives twice.
    const identity = identityOf(args.type, config);
    if (identity) {
      const existing = await ctx.db
        .query("notificationChannels")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const clash = existing.find(
        (row) => identityOf(row.type, (row.config ?? {}) as Record<string, unknown>) === identity,
      );
      if (clash) throw new Error(`${defaultLabel(args.type, config)} is already a destination.`);
    }

    const id = await ctx.db.insert("notificationChannels", {
      userId,
      type: args.type,
      label: args.label?.trim() || defaultLabel(args.type, config),
      config,
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
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Not found");

    const next: Record<string, unknown> = {};
    if (patch.label !== undefined) {
      next.label =
        patch.label.trim() ||
        defaultLabel(doc.type, (doc.config ?? {}) as Record<string, unknown>);
    }
    if (patch.config !== undefined) next.config = patch.config;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;

    await ctx.db.patch(id, next);
    return toApi((await ctx.db.get(id))!);
  },
});

export const remove = mutation({
  args: { id: v.id("notificationChannels") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return { ok: true };

    // A rule pointing at a deleted destination would silently stop delivering,
    // so drop the reference too and let the UI report rules left with none.
    const rules = await ctx.db
      .query("alertRules")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const rule of rules) {
      if (!rule.channelIds.includes(id)) continue;
      await ctx.db.patch(rule._id, {
        channelIds: rule.channelIds.filter((c) => c !== id),
      });
    }

    await ctx.db.delete(id);
    return { ok: true };
  },
});

/** Mint a one-time token the Telegram bot exchanges for a destination. */
export const createTelegramLink = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresInMinutes = 15;
    await ctx.db.insert("telegramLinkTokens", {
      userId,
      token,
      expiresAt: Date.now() + expiresInMinutes * 60_000,
      createdAt: Date.now(),
    });
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "YourStockAlertsBot";
    return {
      token,
      deepLink: `https://t.me/${botUsername}?start=${token}`,
      expiresInMinutes,
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

    const existing = await ctx.db
      .query("notificationChannels")
      .withIndex("by_user", (q) => q.eq("userId", link.userId))
      .collect();
    const already = existing.find(
      (row) => identityOf(row.type, (row.config ?? {}) as Record<string, unknown>) === `telegram:${chatId}`,
    );

    if (already) {
      // Re-linking the same chat should re-enable it, not add a second copy.
      await ctx.db.patch(already._id, { enabled: true });
    } else {
      await ctx.db.insert("notificationChannels", {
        userId: link.userId,
        type: "telegram",
        label: defaultLabel("telegram", { chatId }),
        config: { chatId },
        enabled: true,
        createdAt: Date.now(),
      });
    }
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

/**
 * One-shot migration off per-symbol channels. The same inbox added under three
 * stocks was three rows; collapse each set of duplicates into the oldest,
 * repoint every rule that named a discarded copy, and drop the auto-generated
 * "Email · PLTR" labels that only made sense when a destination belonged to a
 * name. Idempotent — running it twice changes nothing the second time.
 *
 * Run with: npx convex run channels:mergeDuplicateDestinations '{"apply":true}'
 */
export const mergeDuplicateDestinations = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, { apply = false }) => {
    const rows = await ctx.db.query("notificationChannels").collect();
    const byUser = new Map<string, Doc<"notificationChannels">[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }

    const merged: Array<{ kept: string; dropped: string[]; label: string }> = [];
    let relabelled = 0;
    let rulesRepointed = 0;

    for (const [userId, userRows] of byUser) {
      const survivors = new Map<string, Doc<"notificationChannels">>();
      const replacement = new Map<string, string>();

      // Oldest first, so the row the user has had longest is the one that stays.
      for (const row of [...userRows].sort((a, b) => a.createdAt - b.createdAt)) {
        const config = (row.config ?? {}) as Record<string, unknown>;
        const identity = identityOf(row.type, config) ?? `unique:${row._id}`;
        const kept = survivors.get(identity);
        if (!kept) {
          survivors.set(identity, row);
          continue;
        }
        replacement.set(row._id as string, kept._id as string);
        // A destination that was enabled anywhere stays enabled.
        if (row.enabled && !kept.enabled) {
          if (apply) await ctx.db.patch(kept._id, { enabled: true });
          kept.enabled = true;
        }
        if (apply) await ctx.db.delete(row._id);
      }

      for (const [identity, row] of survivors) {
        const dropped = [...replacement.entries()]
          .filter(([, to]) => to === (row._id as string))
          .map(([from]) => from);
        const config = (row.config ?? {}) as Record<string, unknown>;
        const generic = defaultLabel(row.type, config);
        // "Email · PLTR" was never a name the user chose; anything else was.
        const wasAutoLabel = /^(Email|Telegram|Twist)( · .+)?$/i.test(row.label);
        const patch: Record<string, unknown> = { symbol: undefined };
        if (wasAutoLabel && row.label !== generic) {
          patch.label = generic;
          relabelled += 1;
        }
        if (apply) await ctx.db.patch(row._id, patch);
        if (dropped.length) {
          merged.push({ kept: row._id as string, dropped, label: generic });
        }
        void identity;
      }

      if (replacement.size) {
        const rules = await ctx.db
          .query("alertRules")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
        for (const rule of rules) {
          const next = [...new Set(rule.channelIds.map((id) => replacement.get(id) ?? id))];
          if (next.length === rule.channelIds.length && next.every((id, i) => id === rule.channelIds[i])) {
            continue;
          }
          if (apply) await ctx.db.patch(rule._id, { channelIds: next });
          rulesRepointed += 1;
        }
      }
    }

    return {
      applied: apply,
      users: byUser.size,
      destinations: rows.length,
      duplicateSets: merged.length,
      duplicatesRemoved: merged.reduce((sum, m) => sum + m.dropped.length, 0),
      relabelled,
      rulesRepointed,
      merged,
    };
  },
});
