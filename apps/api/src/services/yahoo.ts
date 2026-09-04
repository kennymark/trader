import type { HistoryBar, HistoryRange, Quote, SymbolSearchResult } from "@trader/shared";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const quoteCache = new Map<string, { at: number; data: Quote }>();
const historyCache = new Map<string, { at: number; data: HistoryBar[] }>();
const searchCache = new Map<string, { at: number; data: SymbolSearchResult[] }>();
const insightsCache = new Map<string, { at: number; data: SymbolInsights }>();
const analystCache = new Map<string, { at: number; data: AnalystSnapshot }>();
const fundamentalsCache = new Map<string, { at: number; data: SymbolFundamentals }>();
const calendarCache = new Map<string, { at: number; data: SymbolCalendar }>();

const QUOTE_TTL_MS = 30_000;
const HISTORY_TTL_MS = 5 * 60_000;
const SEARCH_TTL_MS = 60_000;
const INSIGHTS_TTL_MS = 15 * 60_000;
const ANALYST_TTL_MS = 15 * 60_000;
const FUNDAMENTALS_TTL_MS = 30 * 60_000;
const CALENDAR_TTL_MS = 60 * 60_000;

export type SymbolInsights = {
  symbol: string;
  recommendation: {
    rating: "BUY" | "SELL" | "HOLD";
    targetPrice: number | null;
    provider: string | null;
  } | null;
  valuation: string | null;
  shortTerm: { direction: string; scoreDescription: string } | null;
  intermediateTerm: { direction: string; scoreDescription: string } | null;
  longTerm: { direction: string; scoreDescription: string } | null;
  support: number | null;
  resistance: number | null;
  insiderSentiment: number | null;
  sectorInsiderSentiment: number | null;
  recentDevelopments: string[];
};

export type AnalystSnapshot = {
  symbol: string;
  recommendationKey: string | null;
  recommendationMean: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  numberOfAnalystOpinions: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  trend: {
    period: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
};

export type SymbolFundamentals = {
  symbol: string;
  trailingPe: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  ebitdaMargins: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  enterpriseToEbitda: number | null;
  shortName: string | null;
};

export type SymbolCalendar = {
  symbol: string;
  earningsDate: string | null;
  exDividendDate: string | null;
  dividendDate: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  const { period1, interval } = chartParams(range);
  const result = await withRetry(() =>
    yahooFinance.chart(symbol.toUpperCase(), {
      period1,
      interval,
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

function chartParams(range: HistoryRange): { period1: Date; interval: "5m" | "1h" | "1d" } {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case "1d":
      return { period1: new Date(now.getTime() - day), interval: "5m" };
    case "7d":
      return { period1: new Date(now.getTime() - 7 * day), interval: "1h" };
    case "1m":
      return { period1: new Date(now.getTime() - 31 * day), interval: "1d" };
    case "3m":
      return { period1: new Date(now.getTime() - 93 * day), interval: "1d" };
    case "1y":
      return { period1: new Date(now.getTime() - 365 * day), interval: "1d" };
    case "5y":
      return { period1: new Date(now.getTime() - 5 * 365 * day), interval: "1d" };
    case "max":
      return { period1: new Date("1980-01-01"), interval: "1d" };
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

export async function getInsights(symbol: string): Promise<SymbolInsights> {
  const key = symbol.toUpperCase();
  const cached = insightsCache.get(key);
  if (cached && Date.now() - cached.at < INSIGHTS_TTL_MS) {
    return cached.data;
  }

  try {
    // Yahoo insights payloads often fail strict schema checks (e.g. events);
    // skip validation and map the fields we need.
    const raw = (await withRetry(() =>
      yahooFinance.insights(key, { reportsCount: 3 }, { validateResult: false }),
    )) as {
      recommendation?: { rating?: string; targetPrice?: number; provider?: string };
      instrumentInfo?: {
        technicalEvents?: {
          shortTermOutlook?: { direction?: string; scoreDescription?: string };
          intermediateTermOutlook?: { direction?: string; scoreDescription?: string };
          longTermOutlook?: { direction?: string; scoreDescription?: string };
        };
        valuation?: { description?: string; relativeValue?: string };
        keyTechnicals?: { support?: number; resistance?: number };
      };
      companySnapshot?: {
        company?: { insiderSentiments?: number };
        sector?: { insiderSentiments?: number };
      };
      sigDevs?: Array<{ headline?: string }>;
    };

    const tech = raw.instrumentInfo?.technicalEvents;
    const valuation = raw.instrumentInfo?.valuation;
    const keyTech = raw.instrumentInfo?.keyTechnicals;
    const company = raw.companySnapshot?.company;
    const sector = raw.companySnapshot?.sector;
    const rating = raw.recommendation?.rating?.toUpperCase();
    const normalizedRating =
      rating === "BUY" || rating === "SELL" || rating === "HOLD" ? rating : null;

    const data: SymbolInsights = {
      symbol: key,
      recommendation:
        raw.recommendation && normalizedRating
          ? {
              rating: normalizedRating,
              targetPrice: raw.recommendation.targetPrice ?? null,
              provider: raw.recommendation.provider ?? null,
            }
          : null,
      valuation: valuation?.description ?? valuation?.relativeValue ?? null,
      shortTerm: tech?.shortTermOutlook?.direction
        ? {
            direction: tech.shortTermOutlook.direction,
            scoreDescription: tech.shortTermOutlook.scoreDescription || "",
          }
        : null,
      intermediateTerm: tech?.intermediateTermOutlook?.direction
        ? {
            direction: tech.intermediateTermOutlook.direction,
            scoreDescription: tech.intermediateTermOutlook.scoreDescription || "",
          }
        : null,
      longTerm: tech?.longTermOutlook?.direction
        ? {
            direction: tech.longTermOutlook.direction,
            scoreDescription: tech.longTermOutlook.scoreDescription || "",
          }
        : null,
      support: keyTech?.support ?? null,
      resistance: keyTech?.resistance ?? null,
      insiderSentiment: company?.insiderSentiments ?? null,
      sectorInsiderSentiment: sector?.insiderSentiments ?? null,
      recentDevelopments: (raw.sigDevs || [])
        .slice(0, 3)
        .map((d) => d.headline || "")
        .filter(Boolean),
    };
    insightsCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    const empty: SymbolInsights = {
      symbol: key,
      recommendation: null,
      valuation: null,
      shortTerm: null,
      intermediateTerm: null,
      longTerm: null,
      support: null,
      resistance: null,
      insiderSentiment: null,
      sectorInsiderSentiment: null,
      recentDevelopments: [],
    };
    insightsCache.set(key, { at: Date.now(), data: empty });
    return empty;
  }
}

export async function getAnalystSnapshot(symbol: string): Promise<AnalystSnapshot> {
  const key = symbol.toUpperCase();
  const cached = analystCache.get(key);
  if (cached && Date.now() - cached.at < ANALYST_TTL_MS) {
    return cached.data;
  }

  try {
    const summary = await withRetry(() =>
      yahooFinance.quoteSummary(key, {
        modules: ["financialData", "recommendationTrend"],
      }),
    );
    const fd = summary.financialData;
    const trend = summary.recommendationTrend?.trend?.find((t) => t.period === "0m")
      ?? summary.recommendationTrend?.trend?.[0]
      ?? null;

    const data: AnalystSnapshot = {
      symbol: key,
      recommendationKey: fd?.recommendationKey ?? null,
      recommendationMean: fd?.recommendationMean ?? null,
      targetMeanPrice: fd?.targetMeanPrice ?? null,
      targetHighPrice: fd?.targetHighPrice ?? null,
      targetLowPrice: fd?.targetLowPrice ?? null,
      numberOfAnalystOpinions: fd?.numberOfAnalystOpinions ?? null,
      earningsGrowth: fd?.earningsGrowth ?? null,
      revenueGrowth: fd?.revenueGrowth ?? null,
      trend: trend
        ? {
            period: trend.period,
            strongBuy: trend.strongBuy,
            buy: trend.buy,
            hold: trend.hold,
            sell: trend.sell,
            strongSell: trend.strongSell,
          }
        : null,
    };
    analystCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    const empty: AnalystSnapshot = {
      symbol: key,
      recommendationKey: null,
      recommendationMean: null,
      targetMeanPrice: null,
      targetHighPrice: null,
      targetLowPrice: null,
      numberOfAnalystOpinions: null,
      earningsGrowth: null,
      revenueGrowth: null,
      trend: null,
    };
    analystCache.set(key, { at: Date.now(), data: empty });
    return empty;
  }
}

export async function getFundamentals(symbol: string): Promise<SymbolFundamentals> {
  const key = symbol.toUpperCase();
  const cached = fundamentalsCache.get(key);
  if (cached && Date.now() - cached.at < FUNDAMENTALS_TTL_MS) {
    return cached.data;
  }

  try {
    const summary = await withRetry(() =>
      yahooFinance.quoteSummary(key, {
        modules: ["defaultKeyStatistics", "financialData", "price"],
      }),
    );
    const ks = summary.defaultKeyStatistics;
    const fd = summary.financialData;
    const price = summary.price;

    const data: SymbolFundamentals = {
      symbol: key,
      trailingPe: numOrNull(ks?.trailingPE),
      forwardPe: numOrNull(ks?.forwardPE) ?? numOrNull(fd?.forwardPE),
      pegRatio: numOrNull(ks?.pegRatio),
      profitMargins: numOrNull(fd?.profitMargins),
      operatingMargins: numOrNull(fd?.operatingMargins),
      ebitdaMargins: numOrNull(fd?.ebitdaMargins),
      trailingEps: numOrNull(ks?.trailingEps),
      forwardEps: numOrNull(ks?.forwardEps),
      enterpriseToEbitda: numOrNull(ks?.enterpriseToEbitda),
      shortName: price?.shortName ?? price?.longName ?? null,
    };
    fundamentalsCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    const empty: SymbolFundamentals = {
      symbol: key,
      trailingPe: null,
      forwardPe: null,
      pegRatio: null,
      profitMargins: null,
      operatingMargins: null,
      ebitdaMargins: null,
      trailingEps: null,
      forwardEps: null,
      enterpriseToEbitda: null,
      shortName: null,
    };
    fundamentalsCache.set(key, { at: Date.now(), data: empty });
    return empty;
  }
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === "object" && value && "raw" in value) {
    return toIsoDate((value as { raw?: unknown }).raw);
  }
  return null;
}

export async function getCalendar(symbol: string): Promise<SymbolCalendar> {
  const key = symbol.toUpperCase();
  const cached = calendarCache.get(key);
  if (cached && Date.now() - cached.at < CALENDAR_TTL_MS) {
    return cached.data;
  }

  try {
    const summary = await withRetry(() =>
      yahooFinance.quoteSummary(key, {
        modules: ["calendarEvents"],
      }),
    );
    const cal = summary.calendarEvents as
      | {
          earnings?: { earningsDate?: unknown[] };
          exDividendDate?: unknown;
          dividendDate?: unknown;
        }
      | undefined;
    const earningsRaw = cal?.earnings?.earningsDate?.[0];
    const data: SymbolCalendar = {
      symbol: key,
      earningsDate: toIsoDate(earningsRaw),
      exDividendDate: toIsoDate(cal?.exDividendDate),
      dividendDate: toIsoDate(cal?.dividendDate),
    };
    calendarCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    const empty: SymbolCalendar = {
      symbol: key,
      earningsDate: null,
      exDividendDate: null,
      dividendDate: null,
    };
    calendarCache.set(key, { at: Date.now(), data: empty });
    return empty;
  }
}

export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000));
}

