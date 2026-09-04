import type {
  CatalystEvent,
  FeedItem,
  IntelligenceRecommendation,
  IntelligenceResponse,
  IntelligenceSignal,
  OpportunityCard,
  ScenarioAssumptions,
  SymbolIntelligenceDetail,
} from "@trader/shared";
import type { IntelligenceStore } from "./store";
import { computeAnalytics } from "./analytics";
import { isDeepSeekEnabled } from "./deepseek";
import {
  daysUntil,
  getAnalystSnapshot,
  getCalendar,
  getFundamentals,
  getHistory,
  getInsights,
  getQuotes,
  type AnalystSnapshot,
  type SymbolCalendar,
  type SymbolFundamentals,
  type SymbolInsights,
} from "./yahoo";
import { buildAiStockAnalysis, enrichHuntRationales } from "./intelligence/aiAnalyst";
import { buildMarketExpectations } from "./intelligence/expectations";
import {
  detectHappening,
  returnOverBars,
  volumeSpikeRatio,
} from "./intelligence/happening";
import { findHistoricalPatterns } from "./intelligence/patterns";
import { buildPortfolioHealth } from "./intelligence/portfolio";
import {
  loadPriorScores,
  persistOpportunitySnapshots,
  recordPredictionsFromHunt,
} from "./intelligence/predictions";
import {
  defaultAssumptionsFromFundamentals,
  simulateScenarios,
} from "./intelligence/scenarios";
import { computeOpportunityScores } from "./intelligence/scoring";

const BATCH_CACHE = new Map<string, { at: number; data: IntelligenceResponse }>();
const BATCH_TTL_MS = 10 * 60_000;
const DETAIL_CACHE = new Map<string, { at: number; data: SymbolIntelligenceDetail }>();
const DETAIL_TTL_MS = 10 * 60_000;
const MAX_SYMBOLS = 20;

function fmtPct(n: number | null | undefined, digits = 1): string | null {
  if (n == null || Number.isNaN(n)) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function actionFromScore(score: number): IntelligenceRecommendation["action"] {
  if (score >= 0.32) return "buy";
  if (score <= -0.32) return "sell";
  return "hold";
}

function directionBias(direction: string | null | undefined): number {
  if (!direction) return 0;
  const d = direction.toLowerCase();
  if (d === "bullish") return 1;
  if (d === "bearish") return -1;
  return 0;
}

function analystKeyBias(key: string | null | undefined): number {
  if (!key) return 0;
  const k = key.toLowerCase().replace(/_/g, " ");
  if (k.includes("strong buy")) return 1;
  if (k === "buy") return 0.65;
  if (k.includes("strong sell")) return -1;
  if (k === "sell" || k === "underperform") return -0.65;
  return 0;
}

function timingFor(
  action: OpportunityCard["action"],
  insights: SymbolInsights,
  upsidePct: number | null,
  return1yPct: number | null,
): string {
  if (action === "buy") {
    if (insights.shortTerm?.direction === "Bearish" && (upsidePct ?? 0) > 8) {
      return "Accumulate on weakness — short-term soft, longer-term upside intact";
    }
    if ((return1yPct ?? 0) < -10 && (upsidePct ?? 0) > 10) {
      return "Consider buying the dip while analyst targets imply recovery";
    }
    return "Favorable setup — look to buy on pullbacks toward support";
  }
  if (action === "sell") {
    if ((upsidePct ?? 0) < -5) {
      return "Price above consensus targets — trim or exit into strength";
    }
    return "Risk skewed lower — reduce exposure or wait for a clearer base";
  }
  if (insights.resistance != null && insights.support != null) {
    return "Hold / wait — prefer entries near support, not chasing resistance";
  }
  return "Hold — mixed signals; no high-conviction entry or exit yet";
}

function buildSignals(input: {
  return1yPct: number | null;
  maxDrawdown1yPct: number | null;
  upsidePct: number | null;
  analyst: AnalystSnapshot;
  insights: SymbolInsights;
  opportunityScore: number;
  riskScore: number;
}): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];
  signals.push({
    id: "opp_score",
    label: "Opportunity score",
    value: String(input.opportunityScore),
    bias: input.opportunityScore >= 65 ? "buy" : input.opportunityScore <= 40 ? "sell" : "neutral",
  });
  signals.push({
    id: "risk_score",
    label: "Risk score",
    value: String(input.riskScore),
    bias: input.riskScore >= 70 ? "sell" : input.riskScore <= 40 ? "buy" : "neutral",
  });
  const ret = fmtPct(input.return1yPct);
  if (ret) {
    signals.push({
      id: "return_1y",
      label: "1Y performance",
      value: ret,
      bias:
        (input.return1yPct ?? 0) > 12
          ? "buy"
          : (input.return1yPct ?? 0) < -12
            ? "sell"
            : "neutral",
    });
  }
  if (input.upsidePct != null) {
    signals.push({
      id: "upside",
      label: "Analyst upside",
      value: fmtPct(input.upsidePct)!,
      bias: input.upsidePct > 10 ? "buy" : input.upsidePct < -5 ? "sell" : "hold",
    });
  }
  if (input.analyst.recommendationKey) {
    signals.push({
      id: "analyst",
      label: "Analyst consensus",
      value: input.analyst.recommendationKey.replace(/_/g, " "),
      bias: actionFromScore(analystKeyBias(input.analyst.recommendationKey)),
    });
  }
  if (input.insights.longTerm) {
    signals.push({
      id: "tech_long",
      label: "Long-term tech",
      value: `${input.insights.longTerm.direction} · ${input.insights.longTerm.scoreDescription}`,
      bias: actionFromScore(directionBias(input.insights.longTerm.direction) * 0.7),
    });
  }
  if (input.insights.valuation) {
    const v = input.insights.valuation.toLowerCase();
    signals.push({
      id: "valuation",
      label: "Valuation",
      value: input.insights.valuation,
      bias: v.includes("undervalued") || v.includes("discount")
        ? "buy"
        : v.includes("overvalued") || v.includes("premium")
          ? "sell"
          : "neutral",
    });
  }
  if (input.maxDrawdown1yPct != null) {
    signals.push({
      id: "drawdown",
      label: "Max drawdown (1Y)",
      value: fmtPct(input.maxDrawdown1yPct)!,
      bias: input.maxDrawdown1yPct < -35 ? "sell" : "neutral",
    });
  }
  return signals;
}

function upcomingCatalystText(cal: SymbolCalendar, developments: string[]): string | null {
  const days = daysUntil(cal.earningsDate);
  if (days != null && days >= -1 && days <= 90) {
    const when =
      days <= 0 ? "today/soon" : days === 1 ? "tomorrow" : `in ${days} days`;
    return `Earnings ${when}`;
  }
  if (cal.exDividendDate) {
    const d = daysUntil(cal.exDividendDate);
    if (d != null && d >= 0 && d <= 45) return `Ex-dividend in ${d}d`;
  }
  return developments[0] ?? null;
}

function toCatalystEvents(
  symbol: string,
  displayName: string | null,
  cal: SymbolCalendar,
): CatalystEvent[] {
  const events: CatalystEvent[] = [];
  if (cal.earningsDate) {
    events.push({
      id: `${symbol}-earnings`,
      symbol,
      displayName,
      kind: "earnings",
      title: "Earnings",
      date: cal.earningsDate,
      detail: null,
    });
  }
  if (cal.exDividendDate) {
    events.push({
      id: `${symbol}-exdiv`,
      symbol,
      displayName,
      kind: "ex_dividend",
      title: "Ex-dividend",
      date: cal.exDividendDate,
      detail: null,
    });
  }
  return events;
}

type SymbolBundle = {
  quote: Awaited<ReturnType<typeof getQuotes>>[number] | undefined;
  bars: Awaited<ReturnType<typeof getHistory>>;
  insights: SymbolInsights;
  analyst: AnalystSnapshot;
  fundamentals: SymbolFundamentals;
  calendar: SymbolCalendar;
  analytics: ReturnType<typeof computeAnalytics>;
  return1mPct: number | null;
  volSpike: number | null;
};

async function loadBundle(symbol: string): Promise<SymbolBundle> {
  const key = symbol.toUpperCase();
  const [quotes, bars, insights, analyst, fundamentals, calendar] = await Promise.all([
    getQuotes([key]),
    getHistory(key, "1y"),
    getInsights(key),
    getAnalystSnapshot(key),
    getFundamentals(key),
    getCalendar(key),
  ]);
  const analytics = computeAnalytics(key, "1y", bars, 1000, 10);
  return {
    quote: quotes[0],
    bars,
    insights,
    analyst,
    fundamentals,
    calendar,
    analytics,
    return1mPct: returnOverBars(bars, 21),
    volSpike: volumeSpikeRatio(bars),
  };
}

function buildOpportunityCard(symbol: string, bundle: SymbolBundle): OpportunityCard {
  const key = symbol.toUpperCase();
  const { quote, insights, analyst, fundamentals, calendar, analytics } = bundle;
  const price = quote?.price ?? null;
  const targetPrice =
    analyst.targetMeanPrice ?? insights.recommendation?.targetPrice ?? null;
  const upsidePct =
    price != null && targetPrice != null && price > 0
      ? ((targetPrice - price) / price) * 100
      : null;

  const daysToEarnings = daysUntil(calendar.earningsDate);
  const scored = computeOpportunityScores({
    price,
    targetPrice,
    upsidePct,
    return1yPct: analytics.totalReturnPct,
    return1mPct: bundle.return1mPct,
    maxDrawdown1yPct: analytics.maxDrawdownPct,
    volatilityDailyPct: analytics.volatilityDailyPct,
    volumeSpikeRatio: bundle.volSpike,
    analystKey: analyst.recommendationKey,
    analystMean: analyst.recommendationMean,
    earningsGrowth: analyst.earningsGrowth,
    revenueGrowth: analyst.revenueGrowth,
    trailingPe: fundamentals.trailingPe,
    forwardPe: fundamentals.forwardPe,
    profitMargins: fundamentals.profitMargins,
    valuationLabel: insights.valuation,
    shortTermDirection: insights.shortTerm?.direction ?? null,
    intermediateTermDirection: insights.intermediateTerm?.direction ?? null,
    longTermDirection: insights.longTerm?.direction ?? null,
    insiderSentiment: insights.insiderSentiment,
    sectorInsiderSentiment: insights.sectorInsiderSentiment,
    daysToEarnings:
      daysToEarnings != null && daysToEarnings >= 0 ? daysToEarnings : null,
    recentDevelopmentCount: insights.recentDevelopments.length,
    hasUnusualNews: insights.recentDevelopments.length > 0 && (bundle.volSpike ?? 0) >= 1.8,
  });

  const insiderVs =
    insights.insiderSentiment != null && insights.sectorInsiderSentiment != null
      ? insights.insiderSentiment - insights.sectorInsiderSentiment
      : null;

  const happening = detectHappening({
    symbol: key,
    bars: bundle.bars,
    changePercent: quote?.changePercent ?? null,
    return1mPct: bundle.return1mPct,
    volumeSpikeRatio: bundle.volSpike,
    insiderVsSector: insiderVs,
    recentDevelopments: insights.recentDevelopments,
    earningsGrowth: analyst.earningsGrowth,
    revenueGrowth: analyst.revenueGrowth,
    shortTermDirection: insights.shortTerm?.direction ?? null,
  });

  const generatedAt = new Date().toISOString();
  const signals = buildSignals({
    return1yPct: analytics.totalReturnPct,
    maxDrawdown1yPct: analytics.maxDrawdownPct,
    upsidePct,
    analyst,
    insights,
    opportunityScore: scored.opportunityScore,
    riskScore: scored.riskScore,
  });

  const displayName =
    quote?.shortName ?? fundamentals.shortName ?? null;

  return {
    symbol: key,
    displayName,
    price,
    currency: quote?.currency,
    marketCap: quote?.marketCap ?? null,
    changePercent: quote?.changePercent ?? null,
    opportunityScore: scored.opportunityScore,
    riskScore: scored.riskScore,
    convictionScore: scored.convictionScore,
    potentialUpsidePct: scored.potentialUpsidePct,
    keyReason: scored.keyReason,
    upcomingCatalyst: upcomingCatalystText(calendar, insights.recentDevelopments),
    categories: scored.categories,
    breakdown: scored.breakdown,
    action: scored.action,
    confidence: scored.confidence,
    score: scored.score,
    targetPrice,
    upsidePct,
    analystRating:
      analyst.recommendationKey?.replace(/_/g, " ") ??
      insights.recommendation?.rating ??
      null,
    analystCount: analyst.numberOfAnalystOpinions,
    return1yPct: analytics.totalReturnPct,
    maxDrawdown1yPct: analytics.maxDrawdownPct,
    volatilityDailyPct: analytics.volatilityDailyPct,
    timing: timingFor(scored.action, insights, upsidePct, analytics.totalReturnPct),
    rationale: `${scored.action.toUpperCase()} ${key}: ${scored.keyReason}`,
    signals,
    happening,
    lastAnalysedAt: generatedAt,
    generatedAt,
  };
}

function toLegacyRecommendation(card: OpportunityCard): IntelligenceRecommendation {
  return {
    symbol: card.symbol,
    displayName: card.displayName,
    action: card.action,
    confidence: card.confidence,
    score: card.score,
    price: card.price,
    currency: card.currency,
    marketCap: card.marketCap,
    changePercent: card.changePercent,
    targetPrice: card.targetPrice,
    upsidePct: card.upsidePct,
    analystRating: card.analystRating,
    analystCount: card.analystCount,
    return1yPct: card.return1yPct,
    maxDrawdown1yPct: card.maxDrawdown1yPct,
    volatilityDailyPct: card.volatilityDailyPct,
    timing: card.timing,
    rationale: card.rationale,
    signals: card.signals,
    generatedAt: card.generatedAt,
  };
}

function buildFeed(
  opportunities: OpportunityCard[],
  catalysts: CatalystEvent[],
): FeedItem[] {
  const items: FeedItem[] = [];
  const now = new Date().toISOString();

  for (const o of opportunities.slice(0, 8)) {
    items.push({
      id: `opp-${o.symbol}`,
      kind: "opportunity",
      symbol: o.symbol,
      title: `${o.symbol} · Opportunity ${o.opportunityScore}`,
      body: o.keyReason,
      score: o.opportunityScore,
      createdAt: now,
    });
  }

  for (const o of opportunities) {
    for (const h of o.happening.slice(0, 1)) {
      items.push({
        id: `hap-${h.id}`,
        kind: "happening",
        symbol: o.symbol,
        title: `${o.symbol}: ${h.title}`,
        body: h.fact,
        score: h.severity === "high" ? 80 : h.severity === "medium" ? 60 : 40,
        createdAt: h.detectedAt,
      });
    }
  }

  for (const c of catalysts.slice(0, 10)) {
    items.push({
      id: `cat-${c.id}`,
      kind: "catalyst",
      symbol: c.symbol,
      title: `${c.symbol} · ${c.title}`,
      body: c.date ? `Scheduled ${new Date(c.date).toLocaleDateString()}` : "Date TBD",
      score: null,
      createdAt: now,
    });
  }

  return items
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 24);
}

export async function buildIntelligence(
  symbols: string[],
  source: "watchlist" | "symbols",
  opts?: { userId?: string; persist?: boolean; store?: IntelligenceStore },
): Promise<IntelligenceResponse> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_SYMBOLS,
  );
  const cacheKey = `${source}:${unique.slice().sort().join(",")}`;
  const cached = BATCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < BATCH_TTL_MS) {
    return cached.data;
  }

  const cards: OpportunityCard[] = [];
  const catalystAcc: CatalystEvent[] = [];

  for (let i = 0; i < unique.length; i += 3) {
    const chunk = unique.slice(i, i + 3);
    const part = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const bundle = await loadBundle(symbol);
          const card = buildOpportunityCard(symbol, bundle);
          const cats = toCatalystEvents(symbol, card.displayName, bundle.calendar);
          return { card, cats };
        } catch (err) {
          console.error(`Intelligence failed for ${symbol}`, err);
          return null;
        }
      }),
    );
    for (const row of part) {
      if (!row) continue;
      cards.push(row.card);
      catalystAcc.push(...row.cats);
    }
  }

  cards.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const enriched = await enrichHuntRationales(cards);

  let priorScores: Map<string, number> | undefined;
  if (opts?.userId && opts.store) {
    try {
      priorScores = await loadPriorScores(opts.store, opts.userId);
    } catch (err) {
      console.error("Failed loading prior opportunity scores", err);
    }
  }

  let portfolioOpts:
    | {
        holdingsProxy: "watchlist" | "freetrade";
        note?: string;
        weights?: Array<{ symbol: string; weight: number }>;
        holdings?: import("@trader/shared").PortfolioHolding[];
      }
    | undefined;

  if (opts?.userId && opts.store) {
    try {
      const holdings = await opts.store.listHoldings(opts.userId);
      if (holdings.length > 0) {
        const quotes = await getQuotes(holdings.map((h) => h.symbol));
        const qmap = new Map(quotes.map((q) => [q.symbol, q]));
        const totalCost = holdings.reduce((s, h) => s + Math.max(0, h.costBasis ?? 0), 0);
        const enrichedHoldings: import("@trader/shared").PortfolioHolding[] = holdings.map(
          (h) => {
            const price = qmap.get(h.symbol)?.price ?? null;
            const marketValue =
              price != null && Number.isFinite(price) ? price * h.quantity : h.costBasis;
            const unrealizedPnl =
              marketValue != null && h.costBasis != null ? marketValue - h.costBasis : null;
            return {
              ...h,
              price,
              marketValue,
              unrealizedPnl,
              weightPct: null,
            };
          },
        );
        const totalMv = enrichedHoldings.reduce(
          (s, h) => s + Math.max(0, h.marketValue ?? h.costBasis ?? 0),
          0,
        );
        const denom = totalMv > 0 ? totalMv : totalCost;
        for (const h of enrichedHoldings) {
          const w = Math.max(0, h.marketValue ?? h.costBasis ?? 0);
          h.weightPct = denom > 0 ? Math.round((w / denom) * 1000) / 10 : null;
        }
        portfolioOpts = {
          holdingsProxy: "freetrade",
          note: "Health uses your Freetrade holdings, weighted by market value (cost basis fallback).",
          weights: enrichedHoldings.map((h) => ({
            symbol: h.symbol,
            weight: Math.max(0, h.marketValue ?? h.costBasis ?? 0),
          })),
          holdings: enrichedHoldings,
        };
      }
    } catch (err) {
      console.error("Failed loading Freetrade holdings for portfolio health", err);
    }
  }

  const portfolioCards =
    portfolioOpts?.holdingsProxy === "freetrade" && portfolioOpts.weights?.length
      ? enriched.filter((o) => portfolioOpts!.weights!.some((w) => w.symbol === o.symbol))
      : enriched;

  const portfolio = buildPortfolioHealth(
    portfolioCards.length ? portfolioCards : enriched,
    priorScores,
    portfolioOpts,
  );
  const catalysts = catalystAcc
    .filter((c) => c.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const feed = buildFeed(enriched, catalysts);

  if (opts?.userId && opts.store && opts.persist !== false) {
    try {
      await persistOpportunitySnapshots(opts.store, opts.userId, enriched);
      await recordPredictionsFromHunt(opts.store, opts.userId, enriched);
    } catch (err) {
      console.error("Failed persisting intelligence snapshots", err);
    }
  }

  const data: IntelligenceResponse = {
    generatedAt: new Date().toISOString(),
    source,
    aiEnabled: isDeepSeekEnabled(),
    opportunities: enriched,
    feed,
    catalysts,
    portfolio,
    recommendations: enriched.map(toLegacyRecommendation),
  };
  BATCH_CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
}

export async function buildSymbolIntelligence(
  symbol: string,
  assumptions?: Partial<ScenarioAssumptions>,
): Promise<SymbolIntelligenceDetail> {
  const key = symbol.toUpperCase();
  if (!assumptions) {
    const cached = DETAIL_CACHE.get(key);
    if (cached && Date.now() - cached.at < DETAIL_TTL_MS) return cached.data;
  }

  const bundle = await loadBundle(key);
  const opportunity = buildOpportunityCard(key, bundle);
  const [withRationale] = await enrichHuntRationales([opportunity]);
  const card = withRationale || opportunity;

  const expectations = buildMarketExpectations({
    price: card.price,
    targetPrice: card.targetPrice,
    trailingPe: bundle.fundamentals.trailingPe,
    forwardPe: bundle.fundamentals.forwardPe,
    revenueGrowth: bundle.analyst.revenueGrowth,
    earningsGrowth: bundle.analyst.earningsGrowth,
    profitMargins: bundle.fundamentals.profitMargins,
    valuationLabel: bundle.insights.valuation,
    analystKey: bundle.analyst.recommendationKey,
  });

  const baseAssumptions = {
    ...defaultAssumptionsFromFundamentals({
      revenueGrowth: bundle.analyst.revenueGrowth,
      earningsGrowth: bundle.analyst.earningsGrowth,
      profitMargins: bundle.fundamentals.profitMargins,
      trailingPe: bundle.fundamentals.trailingPe,
      forwardPe: bundle.fundamentals.forwardPe,
    }),
    ...assumptions,
  };

  const scenarios = simulateScenarios({
    symbol: key,
    currentPrice: card.price,
    currency: card.currency,
    trailingEps: bundle.fundamentals.trailingEps,
    assumptions: baseAssumptions,
  });

  const patterns = findHistoricalPatterns(bundle.bars);
  const catalysts = toCatalystEvents(key, card.displayName, bundle.calendar);
  const aiAnalysis = await buildAiStockAnalysis(card, expectations);

  const detail: SymbolIntelligenceDetail = {
    opportunity: card,
    expectations,
    aiAnalysis,
    scenarios,
    patterns,
    catalysts,
    happening: card.happening,
  };

  if (!assumptions) {
    DETAIL_CACHE.set(key, { at: Date.now(), data: detail });
  }
  return detail;
}

export function runScenarioSimulator(input: {
  symbol: string;
  currentPrice: number | null;
  currency?: string;
  trailingEps?: number | null;
  assumptions: ScenarioAssumptions;
}) {
  return simulateScenarios(input);
}

export { buildPortfolioHealth, findHistoricalPatterns, simulateScenarios };
