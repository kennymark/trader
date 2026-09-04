"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./users";
import type { Id } from "./_generated/dataModel";
import {
  computeHoldingsFromTrades,
  computePortfolioPerformance,
  parseFreetradeCsv,
  type ParsedFreetradeTx,
} from "../lib/freetrade";
import { buildMarketCompare } from "../lib/marketCompare";
import { buildLedger, computeWhatIf } from "../lib/whatIf";
import { getHistory, getQuotes, resolveDisplayName } from "../lib/yahoo";
import type {
  BrokerConnection,
  HistoryBar,
  MarketCompareResult,
  PortfolioPerformance,
} from "@trader/shared";

const CHUNK = 200;
const BENCHMARK = { label: "S&P 500", symbol: "^GSPC", currency: "USD" };

type StoredTx = {
  externalId: string | null;
  type: string;
  side: string | null;
  symbol: string | null;
  isin: string | null;
  title: string | null;
  account: string | null;
  quantity: number | null;
  price: number | null;
  totalAmount: number | null;
  currency: string | null;
  tradedAt: number | null;
  raw: Record<string, string>;
};

/** Convex stores epoch millis; the computation modules want Date objects. */
function toParsed(rows: StoredTx[]): ParsedFreetradeTx[] {
  return rows.map((r) => ({
    externalId: r.externalId,
    type: r.type,
    side: (r.side as ParsedFreetradeTx["side"]) ?? null,
    symbol: r.symbol,
    isin: r.isin,
    title: r.title,
    account: r.account,
    quantity: r.quantity,
    price: r.price,
    totalAmount: r.totalAmount,
    currency: r.currency,
    fxFeeAmount: null,
    stampDuty: null,
    tradedAt: r.tradedAt != null ? new Date(r.tradedAt) : null,
    raw: r.raw ?? {},
  }));
}

function yahooSymbolFor(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\./g, "-");
}

async function loadTransactions(ctx: any, userId: string) {
  const rows = (await ctx.runQuery(internal.portfolio.listTransactions, {
    userId,
  })) as StoredTx[];
  return toParsed(rows);
}

export const importCsv = action({
  args: { csv: v.string(), syncWatchlist: v.optional(v.boolean()) },
  handler: async (ctx, { csv, syncWatchlist }) => {
    const userId = await requireUserId(ctx);
    const parsed = parseFreetradeCsv(csv);
    if (parsed.length === 0) throw new Error("No rows found in that CSV");
    const holdings = computeHoldingsFromTrades(parsed);

    const connectionId: Id<"brokerConnections"> = await ctx.runMutation(
      internal.portfolio.ensureConnection,
      { userId },
    );

    await ctx.runMutation(internal.portfolio.clearTransactions, { connectionId });
    await ctx.runMutation(internal.portfolio.clearHoldings, { userId });

    const rows = parsed.map((tx, index) => ({
      externalId:
        tx.externalId ||
        `row:${index}:${tx.type}:${tx.symbol ?? ""}:${tx.tradedAt?.toISOString() ?? ""}`,
      type: tx.type,
      side: tx.side,
      symbol: tx.symbol,
      isin: tx.isin,
      title: tx.title,
      account: tx.account,
      quantity: tx.quantity,
      price: tx.price,
      totalAmount: tx.totalAmount,
      currency: tx.currency,
      tradedAt: tx.tradedAt ? tx.tradedAt.getTime() : null,
      raw: tx.raw,
    }));

    for (let i = 0; i < rows.length; i += CHUNK) {
      await ctx.runMutation(internal.portfolio.insertTransactions, {
        userId,
        connectionId,
        rows: rows.slice(i, i + CHUNK),
      });
    }

    if (holdings.length > 0) {
      await ctx.runMutation(internal.portfolio.insertHoldings, {
        userId,
        connectionId,
        rows: holdings.map((h) => ({
          symbol: h.symbol,
          displayName: h.displayName,
          isin: h.isin,
          quantity: h.quantity,
          averageCost: h.averageCost,
          costBasis: h.costBasis,
          currency: h.currency,
        })),
      });
    }

    const tradeCount = parsed.filter((t) => t.side != null).length;
    await ctx.runMutation(internal.portfolio.finishImport, {
      connectionId,
      transactionCount: parsed.length,
      holdingCount: holdings.length,
      meta: {
        accounts: [...new Set(parsed.map((t) => t.account).filter(Boolean) as string[])],
        tradeCount,
      },
    });

    let watchlistSynced: string[] = [];
    if (syncWatchlist !== false && holdings.length > 0) {
      const entries = await Promise.all(
        holdings.map(async (h) => ({
          symbol: h.symbol,
          displayName: h.displayName || (await resolveDisplayName(h.symbol)),
        })),
      );
      watchlistSynced = await ctx.runMutation(internal.portfolio.syncWatchlistSymbols, {
        userId,
        entries,
      });
    }

    return {
      connectionId: connectionId as string,
      provider: "freetrade" as const,
      transactionCount: parsed.length,
      tradeCount,
      holdingCount: holdings.length,
      holdings: holdings.map((h) => ({
        symbol: h.symbol,
        displayName: h.displayName,
        quantity: h.quantity,
        averageCost: h.averageCost,
        costBasis: h.costBasis,
        currency: h.currency,
      })),
      watchlistSynced,
      lastSyncedAt: new Date().toISOString(),
    };
  },
});

export const performance = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    connection: BrokerConnection | null;
    performance: PortfolioPerformance | null;
  }> => {
    const userId = await requireUserId(ctx);
    const connection = (await ctx.runQuery(internal.portfolio.getConnection, {
      userId,
    })) as BrokerConnection | null;
    if (!connection) return { connection: null, performance: null };

    const txs = await loadTransactions(ctx, userId);
    const openSymbols = [
      ...new Set(computeHoldingsFromTrades(txs).map((h) => h.symbol).filter(Boolean)),
    ];

    const yahooMap = new Map(openSymbols.map((s) => [yahooSymbolFor(s), s]));
    const fxToGbp: Record<string, number> = {};
    const quotes: Array<{ symbol: string; price: number; currency: string }> = [];

    try {
      const fetched = await getQuotes([...yahooMap.keys(), "GBPUSD=X"]);
      for (const q of fetched) {
        if (!q.symbol) continue;
        if (q.symbol === "GBPUSD=X" && q.price && q.price > 0) {
          fxToGbp.USD = 1 / q.price;
          continue;
        }
        const original =
          yahooMap.get(q.symbol) || yahooMap.get(q.symbol.replace(/-/g, ".")) || q.symbol;
        if (q.price != null && Number.isFinite(q.price)) {
          quotes.push({ symbol: original, price: q.price, currency: q.currency || "USD" });
        }
      }
    } catch (err) {
      console.error("Failed fetching marks for portfolio P&L", err);
    }

    return {
      connection,
      performance: computePortfolioPerformance(txs, { quotes, fxToGbp }),
    };
  },
});

export const vsMarket = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    connection: BrokerConnection | null;
    comparison: MarketCompareResult | null;
  }> => {
    const userId = await requireUserId(ctx);
    const connection = (await ctx.runQuery(internal.portfolio.getConnection, {
      userId,
    })) as BrokerConnection | null;
    if (!connection) return { connection: null, comparison: null };
    const txs = await loadTransactions(ctx, userId);
    return { connection, comparison: await buildMarketCompare(txs) };
  },
});

/** Daily closes expressing one unit of `from` in `to`. */
async function fxSeries(from: string, to: string): Promise<HistoryBar[] | undefined> {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return undefined;
  try {
    const direct = await getHistory(`${a}${b}=X`, "max");
    if (direct.length > 0) return direct;
  } catch {
    /* fall through to the inverted pair */
  }
  try {
    const inverted = await getHistory(`${b}${a}=X`, "max");
    if (inverted.length > 0) {
      return inverted
        .filter((bar) => bar.close > 0)
        .map((bar) => ({
          ...bar,
          close: 1 / bar.close,
          open: 1 / (bar.open || bar.close),
          high: 1 / (bar.low || bar.close),
          low: 1 / (bar.high || bar.close),
        }));
    }
  } catch (err) {
    console.error(`what-if: no FX history for ${a}/${b}`, err);
  }
  return undefined;
}

export const whatIf = action({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await requireUserId(ctx);
    const connection = (await ctx.runQuery(internal.portfolio.getConnection, {
      userId,
    })) as BrokerConnection | null;
    if (!connection) throw new Error("No broker connection");

    const txs = await loadTransactions(ctx, userId);
    const ledger = buildLedger(txs, key);
    if (!ledger) throw new Error("No transactions for this position.");

    const yahooSymbol = yahooSymbolFor(ledger.symbol);
    let bars: HistoryBar[] = [];
    try {
      bars = await getHistory(yahooSymbol, "max");
    } catch (err) {
      console.error(`what-if: no history for ${yahooSymbol}`, err);
    }
    if (bars.length === 0) {
      throw new Error(`No price history available for ${ledger.symbol}.`);
    }

    const positionCurrency = (ledger.currency || "GBP").toUpperCase();
    let quoteCurrency = positionCurrency;
    try {
      const [quote] = await getQuotes([yahooSymbol]);
      if (quote?.currency) quoteCurrency = quote.currency.toUpperCase();
    } catch (err) {
      console.error(`what-if: no quote for ${yahooSymbol}`, err);
    }

    let benchmark;
    try {
      const benchBars = await getHistory(BENCHMARK.symbol, "max");
      if (benchBars.length > 0) {
        benchmark = {
          label: BENCHMARK.label,
          symbol: BENCHMARK.symbol,
          series: {
            bars: benchBars,
            fx: await fxSeries(BENCHMARK.currency, positionCurrency),
          },
        };
      }
    } catch (err) {
      console.error("what-if: benchmark history failed", err);
    }

    const result = computeWhatIf({
      txs,
      key,
      price: { bars, fx: await fxSeries(quoteCurrency, positionCurrency) },
      quoteCurrency,
      positionCurrency,
      benchmark,
    });

    if ("ok" in result && result.ok === false) throw new Error(result.message);
    return result;
  },
});
