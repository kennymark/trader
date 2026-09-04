"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { evaluateRule, inCooldown } from "../lib/alertRules";
import { deliverToChannel } from "../lib/notify";
import { getHistory, getQuotes } from "../lib/yahoo";
import type { Id } from "./_generated/dataModel";

async function baselinePrice(
  symbol: string,
  baseline: string,
  windowDays: number | null,
  previousClose: number | null,
): Promise<number | null> {
  if (baseline === "prev_close" || baseline === "absolute") return previousClose;
  if (baseline === "n_day_high") {
    const days = windowDays || 20;
    const bars = await getHistory(symbol, days <= 31 ? "1m" : days <= 93 ? "3m" : "1y");
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const window = bars.filter((b) => b.time >= cutoff);
    if (window.length === 0) return null;
    return Math.max(...window.map((b) => b.high));
  }
  return previousClose;
}

/**
 * Evaluate every enabled rule and deliver to the channels it names. Scheduled
 * from crons.ts; replaces the node-cron worker.
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; fired: number }> => {
    const rules: Array<{
      id: string;
      userId: string;
      symbol: string;
      kind: string;
      threshold: number;
      baseline: string;
      baselineWindowDays: number | null;
      channelIds: string[];
      cooldownMinutes: number;
      lastTriggeredAt: number | null;
    }> = await ctx.runQuery(internal.alerts.enabledRules, {});
    if (rules.length === 0) return { checked: 0, fired: 0 };

    const symbols = [...new Set(rules.map((r) => r.symbol))];
    const quotes = await getQuotes(symbols);
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    let fired = 0;

    for (const rule of rules) {
      if (inCooldown(rule.lastTriggeredAt, rule.cooldownMinutes)) continue;
      const quote = quoteMap.get(rule.symbol);
      if (!quote?.price) continue;

      const base = await baselinePrice(
        rule.symbol,
        rule.baseline,
        rule.baselineWindowDays,
        quote.previousClose ?? null,
      );

      const { triggered, message } = evaluateRule(
        rule.kind,
        rule.threshold,
        quote.price,
        base,
      );
      if (!triggered) continue;

      const channels: Array<{
        id: string;
        type: string;
        config: Record<string, unknown>;
      }> = await ctx.runQuery(internal.channels.enabledForUser, {
        userId: rule.userId,
      });
      const selected = channels.filter((c) => rule.channelIds.includes(c.id));
      const subject = `Alert: ${rule.symbol} ${rule.kind}`;
      const body = `${rule.symbol}: ${message}`;
      const delivered: string[] = [];
      let status = "sent";

      for (const ch of selected) {
        try {
          await deliverToChannel(ch.type, ch.config, subject, body);
          delivered.push(ch.id);
        } catch (err) {
          console.error(`Failed to deliver to channel ${ch.id}`, err);
          status = "partial";
        }
      }
      if (delivered.length === 0) status = "failed";

      await ctx.runMutation(internal.alerts.recordFiring, {
        ruleId: rule.id as Id<"alertRules">,
        userId: rule.userId,
        symbol: rule.symbol,
        price: quote.price,
        message: body,
        channels: delivered,
        status,
      });
      fired++;
    }

    return { checked: rules.length, fired };
  },
});
