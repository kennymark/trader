import { z } from "zod";

export const historyRangeSchema = z.enum(["1d", "7d", "1m", "3m", "1y", "5y", "max"]);
export type HistoryRange = z.infer<typeof historyRangeSchema>;

export const channelTypeSchema = z.enum(["email", "telegram", "twist"]);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const alertKindSchema = z.enum(["above", "below", "pct_drop", "pct_rise"]);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const alertBaselineSchema = z.enum(["prev_close", "n_day_high", "absolute"]);
export type AlertBaseline = z.infer<typeof alertBaselineSchema>;

export const addWatchlistSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((s) => s.toUpperCase()),
});

const symbolField = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .transform((s) => s.toUpperCase());

export const createChannelSchema = z.object({
  type: channelTypeSchema,
  label: z.string().trim().min(1).max(80),
  config: z.record(z.unknown()),
  symbol: symbolField,
  enabled: z.boolean().optional().default(true),
});

export const updateChannelSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  symbol: symbolField.optional(),
});

export const linkTelegramSchema = z.object({
  symbol: symbolField,
});

export const createAlertSchema = z.object({
  symbol: symbolField,
  kind: alertKindSchema,
  threshold: z.number().finite(),
  baseline: alertBaselineSchema.default("prev_close"),
  baselineWindowDays: z.number().int().positive().max(365).optional(),
  channelIds: z.array(z.string()).min(1),
  cooldownMinutes: z.number().int().min(1).max(10080).default(60),
  enabled: z.boolean().optional().default(true),
});

export const updateAlertSchema = createAlertSchema.partial();

export const analyticsQuerySchema = z.object({
  range: historyRangeSchema.default("1y"),
  amount: z.coerce.number().positive().default(1000),
  dipPct: z.coerce.number().positive().max(100).default(10),
});

export type Quote = {
  symbol: string;
  shortName?: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  currency?: string;
  marketCap?: number | null;
};

export type SymbolSearchResult = {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
};

export type HistoryBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type AnalyticsResult = {
  symbol: string;
  range: HistoryRange;
  barCount: number;
  startPrice: number | null;
  endPrice: number | null;
  totalReturnPct: number | null;
  avgDailyReturnPct: number | null;
  avgWeeklyReturnPct: number | null;
  avgMonthlyReturnPct: number | null;
  volatilityDailyPct: number | null;
  maxDrawdownPct: number | null;
  dipRecovery: {
    dipPct: number;
    eventCount: number;
    avgBouncePct: number | null;
    avgDaysToRecovery: number | null;
  };
  whatIf: {
    amount: number;
    endingValue: number | null;
    profit: number | null;
    profitPct: number | null;
  };
};

export type WatchlistItem = {
  id: string;
  symbol: string;
  displayName: string | null;
  sortOrder: number;
  createdAt: string;
};

/** A place messages reach you. Account-level — not tied to a stock. */
export type NotificationChannel = {
  id: string;
  type: ChannelType;
  label: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

/** What a rule watches: one ticker, the whole watchlist, or everything held. */
export type AlertScope = "symbol" | "watchlist" | "holdings";

export type AlertRule = {
  id: string;
  scope: AlertScope;
  /** Null unless the scope is a single symbol. */
  symbol: string | null;
  kind: AlertKind;
  threshold: number;
  baseline: AlertBaseline;
  baselineWindowDays: number | null;
  channelIds: string[];
  cooldownMinutes: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
};

export type AlertEvent = {
  id: string;
  ruleId: string;
  symbol: string;
  price: number;
  message: string;
  channels: string[];
  status: string;
  createdAt: string;
};

export const intelligenceActionSchema = z.enum(["buy", "hold", "sell"]);
export type IntelligenceAction = z.infer<typeof intelligenceActionSchema>;

export const opportunityCategorySchema = z.enum([
  "high_conviction",
  "undervalued",
  "momentum",
  "catalyst_plays",
  "beaten_down",
  "something_happening",
]);
export type OpportunityCategory = z.infer<typeof opportunityCategorySchema>;

export const analystVerdictSchema = z.enum([
  "strong_opportunity",
  "attractive",
  "neutral",
  "weak",
  "avoid",
]);
export type AnalystVerdict = z.infer<typeof analystVerdictSchema>;

export const intelligenceQuerySchema = z.object({
  symbols: z
    .string()
    .optional()
    .transform((s) =>
      (s || "")
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
});

export const scenarioAssumptionsSchema = z.object({
  revenueGrowthPct: z.number().finite().default(10),
  epsGrowthPct: z.number().finite().default(10),
  operatingMarginPct: z.number().finite().default(20),
  fcfMarginPct: z.number().finite().default(12),
  peMultiple: z.number().positive().default(20),
  evEbitdaMultiple: z.number().positive().default(12),
  terminalGrowthPct: z.number().finite().min(-5).max(8).default(2.5),
  years: z.number().int().min(1).max(10).default(5),
});
export type ScenarioAssumptions = z.infer<typeof scenarioAssumptionsSchema>;

export type IntelligenceSignal = {
  id: string;
  label: string;
  value: string;
  bias: IntelligenceAction | "neutral";
};

export type ScoreComponent = {
  id: string;
  label: string;
  score: number;
  weight: number;
  note: string | null;
};

export type OpportunityBreakdown = {
  fundamentals: ScoreComponent;
  valuation: ScoreComponent;
  earningsMomentum: ScoreComponent;
  technicals: ScoreComponent;
  insiderActivity: ScoreComponent;
  catalysts: ScoreComponent;
  sentiment: ScoreComponent;
};

/** @deprecated Prefer OpportunityCard — kept for transitional clients */
export type IntelligenceRecommendation = {
  symbol: string;
  displayName: string | null;
  action: IntelligenceAction;
  confidence: number;
  score: number;
  price: number | null;
  currency?: string;
  marketCap: number | null;
  changePercent: number | null;
  targetPrice: number | null;
  upsidePct: number | null;
  analystRating: string | null;
  analystCount: number | null;
  return1yPct: number | null;
  maxDrawdown1yPct: number | null;
  volatilityDailyPct: number | null;
  timing: string;
  rationale: string;
  signals: IntelligenceSignal[];
  generatedAt: string;
};

export type OpportunityCard = {
  symbol: string;
  displayName: string | null;
  price: number | null;
  currency?: string;
  marketCap: number | null;
  changePercent: number | null;
  opportunityScore: number;
  riskScore: number;
  convictionScore: number;
  potentialUpsidePct: number | null;
  keyReason: string;
  upcomingCatalyst: string | null;
  categories: OpportunityCategory[];
  breakdown: OpportunityBreakdown;
  action: IntelligenceAction;
  confidence: number;
  /** Legacy signed score (-1..1) for compatibility */
  score: number;
  targetPrice: number | null;
  upsidePct: number | null;
  analystRating: string | null;
  analystCount: number | null;
  return1yPct: number | null;
  maxDrawdown1yPct: number | null;
  volatilityDailyPct: number | null;
  timing: string;
  rationale: string;
  signals: IntelligenceSignal[];
  happening: HappeningEvent[];
  lastAnalysedAt: string;
  generatedAt: string;
};

export type HappeningEvent = {
  id: string;
  kind: "price" | "volume" | "revision" | "insider" | "news" | "technical";
  title: string;
  detail: string;
  fact: string;
  speculation: string | null;
  severity: "low" | "medium" | "high";
  detectedAt: string;
};

export type MarketExpectations = {
  impliedRevenueGrowthPct: number | null;
  impliedEarningsGrowthPct: number | null;
  impliedOperatingMarginPct: number | null;
  impliedPe: number | null;
  impliedEvEbitda: number | null;
  historicalPe: number | null;
  peerPeHint: number | null;
  analystTargetUpsidePct: number | null;
  expectationGap: number | null;
  gapSummary: string;
  opportunityWhy: string;
  falsifiers: string[];
};

export type AiStockAnalysis = {
  bullCase: string;
  bearCase: string;
  whatMarketExpects: string;
  catalysts: string[];
  keyRisks: string[];
  verdict: AnalystVerdict;
  citedFacts: string[];
  aiGenerated: boolean;
};

export type ScenarioBand = {
  label: "bear" | "base" | "bull";
  assumptions: ScenarioAssumptions;
  impliedPrice: number | null;
  impliedReturnPct: number | null;
};

export type ScenarioResult = {
  symbol: string;
  currentPrice: number | null;
  currency?: string;
  baseAssumptions: ScenarioAssumptions;
  bands: ScenarioBand[];
  disclaimer: string;
};

export type CatalystEvent = {
  id: string;
  symbol: string;
  displayName: string | null;
  kind: "earnings" | "ex_dividend" | "other";
  title: string;
  date: string | null;
  detail: string | null;
};

export type HistoricalPatternMatch = {
  patternId: string;
  label: string;
  description: string;
  sampleSize: number;
  avgReturnPct: number | null;
  winRatePct: number | null;
  medianDaysHeld: number | null;
  disclaimer: string;
};

export type PortfolioHolding = {
  id?: string;
  provider: string;
  symbol: string;
  displayName: string | null;
  isin?: string | null;
  quantity: number;
  averageCost: number | null;
  costBasis: number | null;
  currency: string;
  price?: number | null;
  marketValue?: number | null;
  unrealizedPnl?: number | null;
  weightPct?: number | null;
  updatedAt?: string;
};

export type BrokerConnection = {
  id: string;
  provider: "freetrade";
  label: string;
  lastSyncedAt: string | null;
  transactionCount: number;
  holdingCount: number;
  meta: Record<string, unknown>;
  createdAt: string;
};

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

export type PortfolioHealth = {
  healthScore: number;
  holdingsProxy: "watchlist" | "freetrade";
  note: string;
  symbolCount: number;
  strongest: Array<{ symbol: string; opportunityScore: number; reason: string }>;
  weakest: Array<{ symbol: string; opportunityScore: number; reason: string }>;
  concentration: {
    topSymbolSharePct: number | null;
    sectorProxy: string;
    warning: string | null;
  };
  deteriorating: string[];
  improving: string[];
  averageOpportunityScore: number | null;
  averageRiskScore: number | null;
  holdings?: PortfolioHolding[];
};

export type PositionTrade = {
  date: string;
  type: "buy" | "sell" | "dividend" | "split";
  quantity: number | null;
  price: number | null;
  total: number | null;
  note: string | null;
};

export type SymbolPerformance = {
  key: string;
  symbol: string;
  aliases: string[];
  displayName: string | null;
  isin: string | null;
  status: "open" | "closed";
  quantityHeld: number;
  buyCount: number;
  sellCount: number;
  sharesBought: number;
  sharesSold: number;
  invested: number;
  proceeds: number;
  dividends: number;
  fees: number;
  realizedPnl: number;
  unrealizedPnl: number | null;
  totalPnl: number;
  returnPct: number | null;
  averageCost: number | null;
  averageBuyPrice: number | null;
  averageSellPrice: number | null;
  costBasis: number;
  marketValue: number | null;
  price: number | null;
  priceCurrency: string | null;
  firstBoughtAt: string | null;
  lastActivityAt: string | null;
  holdDays: number | null;
  currency: string;
  trades: PositionTrade[];
};

export type PortfolioInsight = {
  id: string;
  title: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
};

export type PortfolioPerformance = {
  currency: string;
  generatedAt: string;
  symbolCount: number;
  openCount: number;
  closedCount: number;
  invested: number;
  proceeds: number;
  dividends: number;
  interest: number;
  deposits: number;
  withdrawals: number;
  fees: number;
  realizedPnl: number;
  realizedProfit: number;
  realizedLoss: number;
  unrealizedPnl: number | null;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
  best: { symbol: string; displayName: string | null; pnl: number } | null;
  worst: { symbol: string; displayName: string | null; pnl: number } | null;
  insights: PortfolioInsight[];
  positions: SymbolPerformance[];
  series: PnlMonthPoint[];
};

export type PnlMonthPoint = {
  month: string;
  pnl: number;
  cumulative: number;
};

export type MarketCompareYear = {
  year: number;
  youPct: number | null;
  youPnl: number;
  youCapital: number;
  sp500Pct: number | null;
  ftse100Pct: number | null;
  vsSp500Pct: number | null;
  vsFtse100Pct: number | null;
  partial: boolean;
};

export type MarketCompareResult = {
  currency: string;
  firstInvestedAt: string;
  asOf: string;
  note: string;
  overall: {
    youPct: number | null;
    youPnl: number;
    youCapital: number;
    sp500Pct: number | null;
    ftse100Pct: number | null;
    years: number;
  };
  years: MarketCompareYear[];
  benchmarks: Array<{ id: "sp500" | "ftse100"; label: string; symbol: string }>;
};

export type WhatIfSale = {
  date: string;
  quantity: number;
  adjustedQuantity: number;
  price: number | null;
  adjustedPrice: number | null;
  proceeds: number;
  priceToday: number | null;
  valueToday: number | null;
  missed: number | null;
  missedPct: number | null;
  benchmarkValueToday: number | null;
};

export type WhatIfPoint = {
  time: number;
  actual: number;
  neverSold: number;
  reinvested: number | null;
  invested: number;
};

export type WhatIfPath = {
  shares: number;
  marketValue: number;
  cash: number;
  dividends: number;
  totalValue: number;
  totalPnl: number;
  returnPct: number | null;
};

export type WhatIfResult = {
  key: string;
  symbol: string;
  displayName: string | null;
  currency: string;
  quoteCurrency: string;
  asOf: string;
  firstBoughtAt: string;
  lastSoldAt: string | null;
  priceNow: number;
  invested: number;
  sharesSold: number;
  sharesStillHeld: number;
  status: "open" | "closed";
  actual: WhatIfPath;
  neverSold: WhatIfPath;
  reinvested: (WhatIfPath & { label: string; symbol: string }) | null;
  difference: number;
  differencePct: number | null;
  verdict: "sell_cost_you" | "sell_saved_you" | "neutral";
  sales: WhatIfSale[];
  series: WhatIfPoint[];
  quantityAdjustments: Array<{
    date: string;
    quantity: number;
    adjustedQuantity: number;
    factor: number;
    source: "price" | "ledger";
  }>;
  splitsApplied: Array<{ date: string; ratio: number; inferred: boolean }>;
  notes: string[];
};

export type FeedItem = {
  id: string;
  kind: "alert" | "opportunity" | "happening" | "catalyst" | "prediction" | "portfolio";
  symbol: string | null;
  title: string;
  body: string;
  score: number | null;
  createdAt: string;
  /** The call this item carries. Null for items that only report an event. */
  action?: IntelligenceAction | null;
  /** Why the call is what it is — the drivers behind it, in plain words. */
  reasons?: string[];
  /** What would make the call wrong. */
  risk?: string | null;
  /** How sure the scoring is, 0-100. */
  confidence?: number | null;
};

export type PredictionHorizon = 7 | 30 | 90 | 180 | 365;

export type IntelligencePrediction = {
  id: string;
  symbol: string;
  thesis: string;
  action: IntelligenceAction;
  opportunityScore: number;
  convictionScore: number;
  priceAtPrediction: number | null;
  targetPrice: number | null;
  predictedAt: string;
  evaluations: Array<{
    horizonDays: PredictionHorizon;
    dueAt: string;
    evaluatedAt: string | null;
    priceAtEval: number | null;
    returnPct: number | null;
    hitTarget: boolean | null;
  }>;
};

export type PredictionDashboard = {
  total: number;
  evaluated: number;
  hitRatePct: number | null;
  avgReturnPct: number | null;
  byHorizon: Array<{
    horizonDays: PredictionHorizon;
    count: number;
    avgReturnPct: number | null;
    hitRatePct: number | null;
  }>;
  predictions: IntelligencePrediction[];
};

export type SymbolIntelligenceDetail = {
  opportunity: OpportunityCard;
  expectations: MarketExpectations;
  aiAnalysis: AiStockAnalysis;
  scenarios: ScenarioResult;
  patterns: HistoricalPatternMatch[];
  catalysts: CatalystEvent[];
  happening: HappeningEvent[];
};

export type IntelligenceResponse = {
  generatedAt: string;
  source: "watchlist" | "symbols";
  aiEnabled: boolean;
  opportunities: OpportunityCard[];
  feed: FeedItem[];
  catalysts: CatalystEvent[];
  portfolio: PortfolioHealth | null;
  /** @deprecated use opportunities */
  recommendations: IntelligenceRecommendation[];
};

// --- user preferences ---

export const workTabSchema = z.enum(["chart", "intelligence"]);
export type WorkTab = z.infer<typeof workTabSchema>;

/**
 * Every preference here has exactly one consumer in the app; nothing is stored
 * that does not change what a screen does.
 */
export type UserPreferences = {
  /** Range ChartPane opens on. */
  defaultChartRange: HistoryRange;
  /** Tab the work pane opens on. */
  defaultWorkTab: WorkTab;
  /** Watchlist quote polling, in seconds. 0 turns polling off. */
  quoteRefreshSeconds: number;
  /** Whether the hunt spends a model call writing rationales. */
  huntAiRationales: boolean;
  /** Starting values in the per-symbol alert form. */
  alertDefaultBaseline: AlertBaseline;
  alertDefaultWindowDays: number;
  alertDefaultCooldownMinutes: number;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultChartRange: "1y",
  defaultWorkTab: "chart",
  quoteRefreshSeconds: 45,
  huntAiRationales: true,
  alertDefaultBaseline: "prev_close",
  alertDefaultWindowDays: 20,
  alertDefaultCooldownMinutes: 60,
};

export const QUOTE_REFRESH_CHOICES = [0, 15, 45, 120, 300] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Widened so a stored row (whose enum columns are plain strings) can be passed
 * straight in; validating them is this function's whole job.
 */
export type RawPreferences = Partial<Record<keyof UserPreferences, unknown>>;

/** Clamps stored values back into range, so a bad row cannot break a screen. */
export function normalizePreferences(raw: RawPreferences | null | undefined): UserPreferences {
  const p = { ...DEFAULT_PREFERENCES, ...(raw ?? {}) } as Record<keyof UserPreferences, unknown>;
  return {
    defaultChartRange: historyRangeSchema.catch(DEFAULT_PREFERENCES.defaultChartRange).parse(p.defaultChartRange),
    defaultWorkTab: workTabSchema.catch(DEFAULT_PREFERENCES.defaultWorkTab).parse(p.defaultWorkTab),
    quoteRefreshSeconds: QUOTE_REFRESH_CHOICES.includes(p.quoteRefreshSeconds as never)
      ? (p.quoteRefreshSeconds as number)
      : DEFAULT_PREFERENCES.quoteRefreshSeconds,
    huntAiRationales: Boolean(p.huntAiRationales),
    alertDefaultBaseline: alertBaselineSchema
      .catch(DEFAULT_PREFERENCES.alertDefaultBaseline)
      .parse(p.alertDefaultBaseline),
    alertDefaultWindowDays: clampInt(p.alertDefaultWindowDays, 1, 365, DEFAULT_PREFERENCES.alertDefaultWindowDays),
    alertDefaultCooldownMinutes: clampInt(
      p.alertDefaultCooldownMinutes,
      0,
      1440,
      DEFAULT_PREFERENCES.alertDefaultCooldownMinutes,
    ),
  };
}
