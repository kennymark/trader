import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getUserId, requireUserId } from "./users";

const HISTORY_LIMIT = 100;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  createdAt: string;
};

function shape(row: {
  _id: string;
  role: string;
  content: string;
  provider: string | null;
  createdAt: number;
}): ChatMessage {
  return {
    id: row._id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    provider: row.provider,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** The thread, oldest first. Guests have none; the chat needs a portfolio. */
export const history = query({
  args: {},
  handler: async (ctx): Promise<ChatMessage[]> => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(HISTORY_LIMIT);
    return rows.reverse().map(shape);
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
  },
});

export const recentFor = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  handler: async (ctx, { userId, limit }): Promise<ChatMessage[]> => {
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.reverse().map(shape);
  },
});

export const append = internalMutation({
  args: {
    userId: v.string(),
    role: v.string(),
    content: v.string(),
    provider: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", { ...args, createdAt: Date.now() });
  },
});
