import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  brokerConnections,
  brokerTransactions,
  portfolioHoldings,
  watchlistItems,
} from "../db/schema.js";
import {
  computeHoldingsFromTrades,
  computePortfolioPerformance,
  parseFreetradeCsv,
  parsedTxFromStored,
  type ParsedFreetradeTx,
  type PortfolioPerformance,
} from "./freetrade.js";
import { getHistory, getQuotes, resolveDisplayName } from "./yahoo.js";
import { buildMarketCompare, type MarketCompareResult } from "./marketCompare.js";
import {
  buildLedger,
  computeWhatIf,
  type WhatIfFailure,
  type WhatIfInput,
  type WhatIfResult,
} from "./whatIf.js";
import type { HistoryBar } from "@trader/shared";

function id() {
  return crypto.randomUUID();
}

export type FreetradeImportResult = {
  connectionId: string;
  provider: "freetrade";
  transactionCount: number;
  tradeCount: number;
  holdingCount: number;
  holdings: Array<{
    symbol: string;
    displayName: string | null;
    quantity: number;
    averageCost: number | null;
    costBasis: number | null;
    currency: string;
  }>;
  watchlistSynced: string[];
  lastSyncedAt: string;
};

async function getOrCreateConnection(userId: string) {
  const [existing] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(eq(brokerConnections.userId, userId), eq(brokerConnections.provider, "freetrade")),
    );
  if (existing) return existing;

  const row = {
    id: id(),
    userId,
    provider: "freetrade",
    label: "Freetrade",
    lastSyncedAt: null as Date | null,
    transactionCount: 0,
    holdingCount: 0,
    meta: {} as Record<string, unknown>,
  };
  await db.insert(brokerConnections).values(row);
  return { ...row, createdAt: new Date() };
}

function toDbTx(
  userId: string,
  connectionId: string,
  tx: ParsedFreetradeTx,
) {
  return {
    id: id(),
    userId,
    connectionId,
    provider: "freetrade",
    externalId: tx.externalId,
    type: tx.type,
    side: tx.side,
    symbol: tx.symbol,
    isin: tx.isin,
    title: tx.title,
    account: tx.account,
    quantity: tx.quantity != null ? String(tx.quantity) : null,
    price: tx.price != null ? String(tx.price) : null,
    totalAmount: tx.totalAmount != null ? String(tx.totalAmount) : null,
    currency: tx.currency,
    tradedAt: tx.tradedAt,
    raw: tx.raw,
  };
}

export async function importFreetradeCsv(
  userId: string,
  csvText: string,
  opts?: { syncWatchlist?: boolean },
): Promise<FreetradeImportResult> {
  const parsed = parseFreetradeCsv(csvText);
  const holdings = computeHoldingsFromTrades(parsed);
  const connection = await getOrCreateConnection(userId);

  // Replace prior import for this connection
  await db
    .delete(brokerTransactions)
    .where(eq(brokerTransactions.connectionId, connection.id));
  await db
    .delete(portfolioHoldings)
    .where(eq(portfolioHoldings.connectionId, connection.id));

  const tradeCount = parsed.filter((t) => t.side != null).length;

  // Batch insert transactions
  const txRows = parsed.map((tx, index) => {
    const row = toDbTx(userId, connection.id, tx);
    if (!row.externalId) {
      row.externalId = `row:${index}:${tx.type}:${tx.symbol ?? ""}:${tx.tradedAt?.toISOString() ?? ""}`;
    }
    return row;
  });
  const chunk = 200;
  for (let i = 0; i < txRows.length; i += chunk) {
    await db.insert(brokerTransactions).values(txRows.slice(i, i + chunk));
  }

  if (holdings.length > 0) {
    await db.insert(portfolioHoldings).values(
      holdings.map((h) => ({
        id: id(),
        userId,
        connectionId: connection.id,
        provider: "freetrade",
        symbol: h.symbol,
        displayName: h.displayName,
        isin: h.isin,
        quantity: String(h.quantity),
        averageCost: h.averageCost != null ? String(h.averageCost) : null,
        costBasis: h.costBasis != null ? String(h.costBasis) : null,
        currency: h.currency,
        updatedAt: new Date(),
      })),
    );
  }

  const now = new Date();
  await db
    .update(brokerConnections)
    .set({
      lastSyncedAt: now,
      transactionCount: parsed.length,
      holdingCount: holdings.length,
      meta: {
        accounts: [
          ...new Set(parsed.map((t) => t.account).filter(Boolean) as string[]),
        ],
        tradeCount,
      },
    })
    .where(eq(brokerConnections.id, connection.id));

  const watchlistSynced: string[] = [];
  if (opts?.syncWatchlist !== false) {
    for (const h of holdings) {
      try {
        const displayName = h.displayName || (await resolveDisplayName(h.symbol));
        await db.insert(watchlistItems).values({
          id: id(),
          userId,
          symbol: h.symbol,
          displayName,
          sortOrder: 0,
        });
        watchlistSynced.push(h.symbol);
      } catch {
        // already on watchlist
      }
    }
  }

  return {
    connectionId: connection.id,
    provider: "freetrade",
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
    lastSyncedAt: now.toISOString(),
  };
}

export async function getFreetradeConnection(userId: string) {
  const [row] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(eq(brokerConnections.userId, userId), eq(brokerConnections.provider, "freetrade")),
    );
  if (!row) return null;
  return {
    id: row.id,
    provider: "freetrade" as const,
    label: row.label,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    transactionCount: row.transactionCount,
    holdingCount: row.holdingCount,
    meta: row.meta,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPortfolioHoldings(userId: string, provider = "freetrade") {
  const rows = await db
    .select()
    .from(portfolioHoldings)
    .where(
      and(eq(portfolioHoldings.userId, userId), eq(portfolioHoldings.provider, provider)),
    );
  return rows
    .map((r) => ({
      id: r.id,
      provider: r.provider,
      symbol: r.symbol,
      displayName: r.displayName,
      isin: r.isin,
      quantity: Number(r.quantity),
      averageCost: r.averageCost != null ? Number(r.averageCost) : null,
      costBasis: r.costBasis != null ? Number(r.costBasis) : null,
      currency: r.currency,
      updatedAt: r.updatedAt.toISOString(),
    }))
    .sort((a, b) => (b.costBasis ?? 0) - (a.costBasis ?? 0));
}

export async function deleteFreetradeConnection(userId: string) {
  const [row] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(eq(brokerConnections.userId, userId), eq(brokerConnections.provider, "freetrade")),
    );
  if (!row) return { ok: true as const, deleted: false };
  await db.delete(brokerConnections).where(eq(brokerConnections.id, row.id));
  return { ok: true as const, deleted: true };
}

export async function getHoldingSymbols(userId: string): Promise<string[]> {
  const rows = await listPortfolioHoldings(userId);
  return rows.map((r) => r.symbol);
}

function yahooSymbolFor(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\./g, "-");
}

export async function getPortfolioPerformance(
  userId: string,
): Promise<PortfolioPerformance | null> {
  const connection = await getFreetradeConnection(userId);
  if (!connection) return null;

  const rows = await db
    .select()
    .from(brokerTransactions)
    .where(eq(brokerTransactions.userId, userId));

  const txs = rows.map((r) =>
    parsedTxFromStored({
      externalId: r.externalId,
      type: r.type,
      side: r.side,
      symbol: r.symbol,
      isin: r.isin,
      title: r.title,
      account: r.account,
      quantity: r.quantity,
      price: r.price,
      totalAmount: r.totalAmount,
      currency: r.currency,
      tradedAt: r.tradedAt,
      raw: r.raw,
    }),
  );

  const openSymbols = [
    ...new Set(
      computeHoldingsFromTrades(txs)
        .map((h) => h.symbol)
        .filter(Boolean),
    ),
  ];

  const yahooMap = new Map(openSymbols.map((s) => [yahooSymbolFor(s), s]));
  const fxToGbp: Record<string, number> = {};
  const quotes: Array<{ symbol: string; price: number; currency: string }> = [];

  try {
    const wanted = [...yahooMap.keys(), "GBPUSD=X"];
    const fetched = await getQuotes(wanted);
    for (const q of fetched) {
      if (!q.symbol) continue;
      if (q.symbol === "GBPUSD=X" && q.price && q.price > 0) {
        fxToGbp.USD = 1 / q.price;
        continue;
      }
      const original = yahooMap.get(q.symbol) || yahooMap.get(q.symbol.replace(/-/g, ".")) || q.symbol;
      if (q.price != null && Number.isFinite(q.price)) {
        quotes.push({
          symbol: original,
          price: q.price,
          currency: q.currency || "USD",
        });
      }
    }
  } catch (err) {
    console.error("Failed fetching marks for portfolio P&L", err);
  }

  return computePortfolioPerformance(txs, { quotes, fxToGbp });
}

async function loadUserBrokerTxs(userId: string) {
  const rows = await db
    .select()
    .from(brokerTransactions)
    .where(eq(brokerTransactions.userId, userId));
  return rows.map((r) =>
    parsedTxFromStored({
      externalId: r.externalId,
      type: r.type,
      side: r.side,
      symbol: r.symbol,
      isin: r.isin,
      title: r.title,
      account: r.account,
      quantity: r.quantity,
      price: r.price,
      totalAmount: r.totalAmount,
      currency: r.currency,
      tradedAt: r.tradedAt,
      raw: r.raw,
    }),
  );
}

export async function getMarketCompare(userId: string): Promise<MarketCompareResult | null> {
  const connection = await getFreetradeConnection(userId);
  if (!connection) return null;
  const txs = await loadUserBrokerTxs(userId);
  return buildMarketCompare(txs);
}

/**
 * Replay a sold position: what it would be worth today if the sells never happened.
 * Pulls split-adjusted daily closes, a daily FX series when the stock trades in another
 * currency, and the S&P 500 as the "you did something else with the money" yardstick.
 */
export async function getWhatIf(
  userId: string,
  key: string,
): Promise<WhatIfResult | WhatIfFailure | null> {
  const connection = await getFreetradeConnection(userId);
  if (!connection) return null;

  const txs = await loadUserBrokerTxs(userId);
  const ledger = buildLedger(txs, key);
  if (!ledger) {
    return { ok: false, reason: "no_position", message: "No transactions for this position." };
  }

  const yahooSymbol = yahooSymbolFor(ledger.symbol);
  let bars: HistoryBar[] = [];
  try {
    bars = await getHistory(yahooSymbol, "max");
  } catch (err) {
    console.error(`what-if: no history for ${yahooSymbol}`, err);
  }
  if (bars.length === 0) {
    return {
      ok: false,
      reason: "no_price_history",
      message: `No price history available for ${ledger.symbol}.`,
    };
  }

  const positionCurrency = (ledger.currency || "GBP").toUpperCase();
  let quoteCurrency = positionCurrency;
  try {
    const [quote] = await getQuotes([yahooSymbol]);
    if (quote?.currency) quoteCurrency = quote.currency.toUpperCase();
  } catch (err) {
    console.error(`what-if: no quote for ${yahooSymbol}`, err);
  }

  const priceSeries = {
    bars,
    fx: await fxSeries(quoteCurrency, positionCurrency),
  };

  let benchmark: WhatIfInput["benchmark"];
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

  return computeWhatIf({
    txs,
    key,
    price: priceSeries,
    quoteCurrency,
    positionCurrency,
    benchmark,
  });
}

const BENCHMARK = { label: "S&P 500", symbol: "^GSPC", currency: "USD" };

/** Daily closes expressing 1 unit of `from` in `to`, or undefined when no conversion is needed. */
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
        .map((bar) => ({ ...bar, close: 1 / bar.close, open: 1 / (bar.open || bar.close), high: 1 / (bar.low || bar.close), low: 1 / (bar.high || bar.close) }));
    }
  } catch (err) {
    console.error(`what-if: no FX history for ${a}/${b}`, err);
  }
  return undefined;
}
