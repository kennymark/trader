import type { HistoryBar, HistoryRange, Quote, SymbolSearchResult } from "@trader/shared";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const quoteCache = new Map<string, { at: number; data: Quote }>();
const historyCache = new Map<string, { at: number; data: HistoryBar[] }>();
const searchCache = new Map<string, { at: number; data: SymbolSearchResult[] }>();

const QUOTE_TTL_MS = 30_000;
const HISTORY_TTL_MS = 5 * 60_000;
const SEARCH_TTL_MS = 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(400 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const results: Quote[] = [];
  const missing: string[] = [];

  for (const symbol of unique) {
    const cached = quoteCache.get(symbol);
    if (cached && Date.now() - cached.at < QUOTE_TTL_MS) {
      results.push(cached.data);
    } else {
      missing.push(symbol);
    }
  }

  if (missing.length > 0) {
    const quotes = await withRetry(() =>
      yahooFinance.quote(missing.length === 1 ? missing[0]! : missing, {
        fields: [
          "symbol",
          "shortName",
          "regularMarketPrice",
          "regularMarketPreviousClose",
          "regularMarketChange",
          "regularMarketChangePercent",
          "currency",
          "marketCap",
        ],
      }),
    );

    const list = Array.isArray(quotes) ? quotes : [quotes];
    for (const q of list) {
      if (!q?.symbol) continue;
      const data: Quote = {
        symbol: q.symbol,
        shortName: q.shortName,
        price: q.regularMarketPrice ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        currency: q.currency,
        marketCap: q.marketCap ?? null,
      };
      quoteCache.set(data.symbol, { at: Date.now(), data });
      results.push(data);
    }
  }

  return unique.map((s) => results.find((r) => r.symbol === s)).filter(Boolean) as Quote[];
}

export async function getHistory(symbol: string, range: HistoryRange): Promise<HistoryBar[]> {
  const key = `${symbol.toUpperCase()}:${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_TTL_MS) {
    return cached.data;
  }

  const result = await withRetry(() =>
    yahooFinance.chart(symbol.toUpperCase(), {
      period1: periodStart(range),
      interval: "1d",
    }),
  );

  const quotes = result?.quotes || [];
  const bars: HistoryBar[] = quotes
    .filter((r) => r.close != null && r.date != null)
    .map((r) => ({
      time: Math.floor(new Date(r.date).getTime() / 1000),
      open: r.open ?? r.close!,
      high: r.high ?? r.close!,
      low: r.low ?? r.close!,
      close: r.close!,
      volume: r.volume ?? undefined,
    }));

  historyCache.set(key, { at: Date.now(), data: bars });
  return bars;
}

function periodStart(range: HistoryRange): Date {
  const now = new Date();
  switch (range) {
    case "1m":
      return new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    case "3m":
      return new Date(now.getTime() - 93 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "5y":
      return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    case "max":
      return new Date("1980-01-01");
  }
}

export async function resolveDisplayName(symbol: string): Promise<string | null> {
  try {
    const [q] = await getQuotes([symbol]);
    return q?.shortName ?? null;
  } catch {
    return null;
  }
}

const ALLOWED_TYPES = new Set(["EQUITY", "ETF", "INDEX", "MUTUALFUND"]);

export async function searchSymbols(query: string, limit = 8): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const key = q.toUpperCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) {
    return cached.data.slice(0, limit);
  }

  const result = await withRetry(() => yahooFinance.search(q, { quotesCount: 12, newsCount: 0 }));
  const quotes = (result?.quotes || []) as Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    exchDisp?: string;
    exchange?: string;
  }>;

  const mapped: SymbolSearchResult[] = quotes
    .filter((item) => item.symbol && (!item.quoteType || ALLOWED_TYPES.has(item.quoteType)))
    .map((item) => ({
      symbol: String(item.symbol).toUpperCase(),
      name: item.longname || item.shortname || String(item.symbol),
      exchange: item.exchDisp || item.exchange,
      type: item.quoteType,
    }));

  // Prefer exact / prefix matches, then keep order from Yahoo.
  mapped.sort((a, b) => {
    const aq = a.symbol === key ? 0 : a.symbol.startsWith(key) ? 1 : 2;
    const bq = b.symbol === key ? 0 : b.symbol.startsWith(key) ? 1 : 2;
    return aq - bq;
  });

  const unique: SymbolSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of mapped) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    unique.push(item);
  }

  searchCache.set(key, { at: Date.now(), data: unique });
  return unique.slice(0, limit);
}

