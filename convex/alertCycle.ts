"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { evaluateRule } from "../lib/alertRules";
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

type EnabledRule = {
  id: string;
  userId: string;
  scope: "symbol" | "watchlist" | "holdings";
  symbol: string | null;
  kind: string;
  threshold: number;
  baseline: string;
  baselineWindowDays: number | null;
  channelIds: string[];
  cooldownMinutes: number;
  lastTriggeredAt: number | null;
};

/**
 * Evaluate every enabled rule and deliver to the destinations it names. A rule
 * can watch one ticker, the whole watchlist, or everything held, so the work is
 * per (rule, symbol) pair rather than per rule. Scheduled from crons.ts.
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; fired: number }> => {
    const rules: EnabledRule[] = await ctx.runQuery(internal.alerts.enabledRules, {});
    if (rules.length === 0) return { checked: 0, fired: 0 };

    // One resolution per user per scope, however many rules share it.
    const scopeCache = new Map<string, string[]>();
    async function symbolsForScope(rule: EnabledRule): Promise<string[]> {
      if (rule.scope === "symbol") return rule.symbol ? [rule.symbol] : [];
      const key = `${rule.userId}:${rule.scope}`;
      const cached = scopeCache.get(key);
      if (cached) return cached;

      let resolved: string[];
      if (rule.scope === "watchlist") {
        resolved = await ctx.runQuery(internal.watchlist.symbolsFor, { userId: rule.userId });
      } else {
        const holdings: Array<{ symbol: string }> = await ctx.runQuery(
          internal.portfolio.listHoldings,
          { userId: rule.userId },
        );
        resolved = holdings.map((h) => h.symbol);
      }
      resolved = [...new Set(resolved.map((sym) => sym.toUpperCase()).filter(Boolean))];
      scopeCache.set(key, resolved);
      return resolved;
    }

    const targets = new Map<string, string[]>();
    for (const rule of rules) targets.set(rule.id, await symbolsForScope(rule));

    const symbols = [...new Set([...targets.values()].flat())];
    if (symbols.length === 0) return { checked: rules.length, fired: 0 };

    const quotes = await getQuotes(symbols);
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    let fired = 0;

    for (const rule of rules) {
      const ruleSymbols = targets.get(rule.id) ?? [];
      if (ruleSymbols.length === 0) continue;

      // Per symbol, so one name moving doesn't mute the rest of the scope.
      const muted: string[] = await ctx.runQuery(internal.alerts.symbolsInCooldown, {
        ruleId: rule.id,
        since: Date.now() - rule.cooldownMinutes * 60_000,
      });
      const mutedSet = new Set(muted);

      const channels: Array<{
        id: string;
        type: string;
        config: Record<string, unknown>;
      }> = await ctx.runQuery(internal.channels.enabledForUser, { userId: rule.userId });
      const selected = channels.filter((c) => rule.channelIds.includes(c.id));

      for (const symbol of ruleSymbols) {
        if (mutedSet.has(symbol)) continue;
        const quote = quoteMap.get(symbol);
        if (!quote?.price) continue;

        const base = await baselinePrice(
          symbol,
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

        const body = `${symbol} ${message}`;
        const subject = `${symbol}: ${rule.kind === "pct_drop" || rule.kind === "below" ? "down" : "up"} — ${body}`;
        const delivered: string[] = [];
        let status = "sent";

        for (const ch of selected) {
          try {
            await deliverToChannel(ch.type, ch.config, subject, body);
            delivered.push(ch.id);
          } catch (err) {
            console.error(`Failed to deliver to destination ${ch.id}`, err);
            status = "partial";
          }
        }
        // The event row itself is the in-app delivery, so a rule with no
        // external destination still lands; only asked-for sends can fail.
        if (selected.length > 0 && delivered.length === 0) status = "failed";

        await ctx.runMutation(internal.alerts.recordFiring, {
          ruleId: rule.id as Id<"alertRules">,
          userId: rule.userId,
          symbol,
          price: quote.price,
          message: body,
          channels: delivered,
          status,
        });
        fired++;
      }
    }

    return { checked: rules.length, fired };
  },
});
