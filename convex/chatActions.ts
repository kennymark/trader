"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireUserId } from "./users";
import { buildSystemPrompt, type ChatContext } from "../lib/chat";
import { askLlm, PROVIDER_LABELS, resolveProvider, type LlmTurn } from "../lib/llm";
import type {
  AlertEvent,
  BrokerConnection,
  OpportunityCard,
  PortfolioHolding,
  PortfolioPerformance,
} from "@trader/shared";

/** Turns of prior conversation sent back with a question. */
const HISTORY_TURNS = 12;

export type ChatStatus = {
  configured: boolean;
  provider: string | null;
  /** True once a broker import exists, so the UI can say what the model can see. */
  hasPortfolio: boolean;
};

/**
 * Whether the deployment can answer at all. Reported separately from asking so
 * the surface can say "no model configured" before the user types anything,
 * rather than failing them after they have written a question.
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<ChatStatus> => {
    const userId = await requireUserId(ctx);
    const provider = resolveProvider();
    const connection = (await ctx.runQuery(internal.portfolio.getConnection, {
      userId,
    })) as BrokerConnection | null;
    return {
      configured: provider != null,
      provider: provider ? PROVIDER_LABELS[provider] : null,
      hasPortfolio: connection != null,
    };
  },
});

async function gatherContext(ctx: any, userId: string): Promise<ChatContext> {
  // The performance action owns the marks and the FX; running it here keeps one
  // definition of the numbers rather than a second one the chat could drift from.
  const [perf, holdings, watchlist, alerts, cards] = await Promise.all([
    ctx
      .runAction(api.portfolioActions.performance, {})
      .catch((err: unknown) => {
        console.error("Chat could not load performance", err);
        return { connection: null, performance: null };
      }) as Promise<{ performance: PortfolioPerformance | null }>,
    ctx.runQuery(internal.portfolio.listHoldings, { userId }) as Promise<PortfolioHolding[]>,
    ctx.runQuery(internal.watchlist.rowsFor, { userId }) as Promise<
      Array<{ symbol: string; displayName: string | null }>
    >,
    ctx.runQuery(internal.alerts.recentEvents, { userId, limit: 15 }) as Promise<AlertEvent[]>,
    ctx.runQuery(internal.intelligence.latestCards, { userId, limit: 12 }) as Promise<
      OpportunityCard[]
    >,
  ]);

  const scores = new Map(cards.map((c) => [c.symbol, c.opportunityScore]));

  return {
    currency: perf.performance?.currency ?? "GBP",
    performance: perf.performance,
    holdings,
    watchlist: watchlist.map((w) => ({ ...w, score: scores.get(w.symbol) ?? null })),
    alerts,
    opportunities: cards,
    asOf: new Date().toISOString(),
  };
}

export const ask = action({
  args: { question: v.string() },
  handler: async (ctx, { question }): Promise<{ answer: string; provider: string }> => {
    const userId = await requireUserId(ctx);
    const text = question.trim();
    if (!text) throw new Error("Ask something first.");

    const provider = resolveProvider();
    if (!provider) {
      throw new Error(
        "No model configured. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY on the Convex deployment.",
      );
    }

    const prior = (await ctx.runQuery(internal.chat.recentFor, {
      userId,
      limit: HISTORY_TURNS,
    })) as Array<{ role: "user" | "assistant"; content: string }>;

    const context = await gatherContext(ctx, userId);
    const turns: LlmTurn[] = [
      ...prior.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    // Record the question before the call so an answer that fails still leaves
    // the thread showing what was asked.
    await ctx.runMutation(internal.chat.append, {
      userId,
      role: "user",
      content: text,
      provider: null,
    });

    const answer = await askLlm(buildSystemPrompt(context), turns);

    await ctx.runMutation(internal.chat.append, {
      userId,
      role: "assistant",
      content: answer,
      provider: PROVIDER_LABELS[provider],
    });

    return { answer, provider: PROVIDER_LABELS[provider] };
  },
});
