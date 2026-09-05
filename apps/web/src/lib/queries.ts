import type {
  AlertEvent,
  AlertRule,
  AnalyticsResult,
  BrokerConnection,
  FreetradeImportResult,
  HistoryBar,
  HistoryRange,
  IntelligenceResponse,
  MarketCompareResult,
  NotificationChannel,
  PortfolioHealth,
  PortfolioHolding,
  PortfolioPerformance,
  PredictionDashboard,
  Quote,
  ScenarioAssumptions,
  ScenarioResult,
  SymbolIntelligenceDetail,
  SymbolSearchResult,
  WatchlistItem,
  WhatIfResult,
} from "@trader/shared";
import { api } from "../../../../convex/_generated/api";
import type { Id, TableNames } from "../../../../convex/_generated/dataModel";
import { convex } from "./convex";

/**
 * Every call the UI makes, backed by Convex functions. Signatures and return
 * shapes match what the old HTTP client returned, so components did not change.
 */

/** Convex ids arrive from the server as plain strings. */
const asId = <T extends TableNames>(id: string) => id as Id<T>;

// --- watchlist ---

export const fetchWatchlist = async (): Promise<WatchlistItem[]> =>
  ((await convex.query(api.watchlist.list, {})) ?? []) as WatchlistItem[];

export const addWatchlist = (symbol: string, displayName?: string) =>
  convex.mutation(api.watchlist.add, { symbol, displayName }) as Promise<WatchlistItem>;

export const removeWatchlist = (id: string) =>
  convex.mutation(api.watchlist.remove, { id: asId<"watchlistItems">(id) });

export const syncWatchlist = (symbols: string[]) =>
  convex.mutation(api.watchlist.sync, { symbols });

// --- market data (public) ---

export const fetchQuotes = (symbols: string[]) =>
  convex.action(api.market.quotes, { symbols }) as Promise<Quote[]>;

export const searchSymbols = (q: string) =>
  convex.action(api.market.search, { query: q }) as Promise<SymbolSearchResult[]>;

export const fetchHistory = (symbol: string, range: HistoryRange) =>
  convex.action(api.market.history, { symbol, range }) as Promise<{
    symbol: string;
    range: HistoryRange;
    bars: HistoryBar[];
  }>;

export const fetchAnalytics = (
  symbol: string,
  params: { range: HistoryRange; amount: number; dipPct: number },
) =>
  convex.action(api.market.analytics, {
    symbol,
    range: params.range,
    amount: params.amount,
    dipPct: params.dipPct,
  }) as Promise<AnalyticsResult>;

// --- channels ---

export const fetchChannels = () =>
  convex.query(api.channels.list, {}) as Promise<NotificationChannel[]>;

export const createChannel = (body: {
  type: string;
  label?: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}) => convex.mutation(api.channels.create, body) as Promise<NotificationChannel>;

export const updateChannel = (
  id: string,
  body: Partial<{
    label: string;
    config: Record<string, unknown>;
    enabled: boolean;
  }>,
) =>
  convex.mutation(api.channels.update, {
    id: asId<"notificationChannels">(id),
    ...body,
  }) as Promise<NotificationChannel>;

export const deleteChannel = (id: string) =>
  convex.mutation(api.channels.remove, { id: asId<"notificationChannels">(id) });

export const linkTelegram = () =>
  convex.mutation(api.channels.createTelegramLink, {}) as Promise<{
    token: string;
    deepLink: string;
    expiresInMinutes: number;
  }>;

// --- alerts ---

export const fetchAlerts = () => convex.query(api.alerts.list, {}) as Promise<AlertRule[]>;

export const createAlert = (body: unknown) =>
  convex.mutation(api.alerts.create, body as never) as Promise<AlertRule>;

export const updateAlert = (id: string, body: unknown) =>
  convex.mutation(api.alerts.update, {
    id: asId<"alertRules">(id),
    ...(body as object),
  } as never) as Promise<AlertRule>;

export const deleteAlert = (id: string) =>
  convex.mutation(api.alerts.remove, { id: asId<"alertRules">(id) });

export const fetchAlertEvents = () =>
  convex.query(api.alerts.events, {}) as Promise<AlertEvent[]>;

// --- intelligence ---

export const fetchIntelligence = (symbols?: string[]) =>
  convex.action(api.intelligenceActions.hunt, {
    symbols: symbols && symbols.length > 0 ? symbols : undefined,
  }) as Promise<IntelligenceResponse>;

export const fetchSymbolIntelligence = (symbol: string) =>
  convex.action(api.intelligenceActions.forSymbol, {
    symbol,
  }) as Promise<SymbolIntelligenceDetail>;

export const fetchPortfolioHealth = () =>
  convex.action(api.intelligenceActions.portfolioHealth, {}) as Promise<PortfolioHealth>;

export const fetchPredictions = () =>
  convex.action(api.intelligenceActions.predictions, {}) as Promise<PredictionDashboard>;

export const simulateScenarios = (
  symbol: string,
  assumptions: Partial<ScenarioAssumptions>,
) =>
  convex.action(api.intelligenceActions.scenarios, {
    symbol,
    assumptions,
  }) as Promise<ScenarioResult>;

// --- portfolio ---

export const fetchFreetrade = () =>
  convex.query(api.portfolio.freetrade, {}) as Promise<{
    connection: BrokerConnection | null;
    holdings: PortfolioHolding[];
  }>;

export const importFreetradeCsv = (csv: string, syncWatchlistToo = true) =>
  convex.action(api.portfolioActions.importCsv, {
    csv,
    syncWatchlist: syncWatchlistToo,
  }) as Promise<FreetradeImportResult>;

export const disconnectFreetrade = () =>
  convex.mutation(api.portfolio.disconnect, {}) as Promise<{
    ok: boolean;
    deleted: boolean;
  }>;

export const fetchPortfolioPerformance = () =>
  convex.action(api.portfolioActions.performance, {}) as Promise<{
    connection: BrokerConnection | null;
    performance: PortfolioPerformance | null;
  }>;

export const fetchMarketCompare = () =>
  convex.action(api.portfolioActions.vsMarket, {}) as Promise<{
    connection: BrokerConnection | null;
    comparison: MarketCompareResult | null;
  }>;

export const fetchWhatIf = (key: string) =>
  convex.action(api.portfolioActions.whatIf, { key }) as Promise<WhatIfResult>;

// --- chat ---

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  createdAt: string;
};

export type ChatStatus = {
  configured: boolean;
  provider: string | null;
  hasPortfolio: boolean;
};

export const fetchChatHistory = () =>
  convex.query(api.chat.history, {}) as Promise<ChatMessage[]>;

export const fetchChatStatus = () =>
  convex.action(api.chatActions.status, {}) as Promise<ChatStatus>;

export const askChat = (question: string) =>
  convex.action(api.chatActions.ask, { question }) as Promise<{
    answer: string;
    provider: string;
  }>;

export const clearChat = () => convex.mutation(api.chat.clear, {});
