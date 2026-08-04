import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { alertEvents, alertRules, notificationChannels } from "../db/schema.js";
import { getHistory, getQuotes } from "../services/yahoo.js";
import { deliverToChannel } from "../services/notify.js";

function id() {
  return crypto.randomUUID();
}

function inCooldown(lastTriggeredAt: Date | null, cooldownMinutes: number) {
  if (!lastTriggeredAt) return false;
  return Date.now() - lastTriggeredAt.getTime() < cooldownMinutes * 60_000;
}

async function baselinePrice(
  symbol: string,
  baseline: string,
  windowDays: number | null,
  previousClose: number | null,
): Promise<number | null> {
  if (baseline === "prev_close" || baseline === "absolute") {
    return previousClose;
  }
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

function evaluateRule(
  kind: string,
  threshold: number,
  price: number,
  basePrice: number | null,
): { triggered: boolean; message: string } {
  if (kind === "above") {
    return {
      triggered: price >= threshold,
      message: `${price.toFixed(2)} is at/above ${threshold}`,
    };
  }
  if (kind === "below") {
    return {
      triggered: price <= threshold,
      message: `${price.toFixed(2)} is at/below ${threshold}`,
    };
  }
  if (!basePrice || basePrice <= 0) {
    return { triggered: false, message: "No baseline price" };
  }
  const changePct = ((price - basePrice) / basePrice) * 100;
  if (kind === "pct_drop") {
    return {
      triggered: changePct <= -Math.abs(threshold),
      message: `${price.toFixed(2)} is ${changePct.toFixed(2)}% vs baseline ${basePrice.toFixed(2)} (drop threshold ${threshold}%)`,
    };
  }
  if (kind === "pct_rise") {
    return {
      triggered: changePct >= Math.abs(threshold),
      message: `${price.toFixed(2)} is ${changePct.toFixed(2)}% vs baseline ${basePrice.toFixed(2)} (rise threshold ${threshold}%)`,
    };
  }
  return { triggered: false, message: "Unknown rule kind" };
}

export async function runAlertCycle() {
  const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true));
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
      quote.previousClose,
    );

    const threshold = Number(rule.threshold);
    const { triggered, message } = evaluateRule(rule.kind, threshold, quote.price, base);

    if (!triggered) continue;

    const channels = await db
      .select()
      .from(notificationChannels)
      .where(
        and(
          eq(notificationChannels.userId, rule.userId),
          eq(notificationChannels.enabled, true),
        ),
      );

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

    await db.insert(alertEvents).values({
      id: id(),
      userId: rule.userId,
      ruleId: rule.id,
      symbol: rule.symbol,
      price: String(quote.price),
      message: body,
      channels: delivered,
      status,
    });

    await db
      .update(alertRules)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(alertRules.id, rule.id));

    fired++;
  }

  return { checked: rules.length, fired };
}
