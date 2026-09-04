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
import { api } from "./api";

export const fetchWatchlist = () => api<WatchlistItem[]>("/api/watchlist");

export const addWatchlist = (symbol: string) =>
  api<WatchlistItem>("/api/watchlist", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });

export const removeWatchlist = (id: string) =>
  api<{ ok: boolean }>(`/api/watchlist/${id}`, { method: "DELETE" });

export const syncWatchlist = (symbols: string[]) =>
  api<{ saved: string[] }>("/api/watchlist/sync", {
    method: "POST",
    body: JSON.stringify({ symbols }),
  });

export const fetchQuotes = (symbols: string[]) =>
  api<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);

export const searchSymbols = (q: string) =>
  api<SymbolSearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);

export const fetchHistory = (symbol: string, range: HistoryRange) =>
  api<{ symbol: string; range: HistoryRange; bars: HistoryBar[] }>(
    `/api/history/${symbol}?range=${range}`,
  );

export const fetchAnalytics = (
  symbol: string,
  params: { range: HistoryRange; amount: number; dipPct: number },
) =>
  api<AnalyticsResult>(
    `/api/analytics/${symbol}?range=${params.range}&amount=${params.amount}&dipPct=${params.dipPct}`,
  );

export const fetchChannels = () => api<NotificationChannel[]>("/api/channels");

export const createChannel = (body: {
  type: string;
  label: string;
  config: Record<string, unknown>;
  symbol: string;
  enabled?: boolean;
}) =>
  api<NotificationChannel>("/api/channels", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateChannel = (
  id: string,
  body: Partial<{
    label: string;
    config: Record<string, unknown>;
    enabled: boolean;
    symbol: string;
  }>,
) =>
  api<NotificationChannel>(`/api/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteChannel = (id: string) =>
  api<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" });

export const linkTelegram = (symbol: string) =>
  api<{ token: string; deepLink: string; expiresInMinutes: number; symbol: string }>(
    "/api/channels/telegram/link",
    { method: "POST", body: JSON.stringify({ symbol }) },
  );

export const fetchAlerts = () => api<AlertRule[]>("/api/alerts");

export const createAlert = (body: unknown) =>
  api<AlertRule>("/api/alerts", { method: "POST", body: JSON.stringify(body) });

export const updateAlert = (id: string, body: unknown) =>
  api<AlertRule>(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAlert = (id: string) =>
  api<{ ok: boolean }>(`/api/alerts/${id}`, { method: "DELETE" });

export const fetchAlertEvents = () => api<AlertEvent[]>("/api/alerts/events");

export const fetchIntelligence = (symbols?: string[]) => {
  if (symbols && symbols.length > 0) {
    return api<IntelligenceResponse>("/api/intelligence", {
      method: "POST",
      body: JSON.stringify({ symbols }),
    });
  }
  return api<IntelligenceResponse>("/api/intelligence");
};

export const fetchSymbolIntelligence = (symbol: string) =>
  api<SymbolIntelligenceDetail>(`/api/intelligence/${encodeURIComponent(symbol)}`);

export const fetchPortfolioHealth = () =>
  api<PortfolioHealth>("/api/intelligence/portfolio");

export const fetchPredictions = () =>
  api<PredictionDashboard>("/api/intelligence/predictions");

export const simulateScenarios = (
  symbol: string,
  assumptions: Partial<ScenarioAssumptions>,
) =>
  api<ScenarioResult>("/api/intelligence/scenarios", {
    method: "POST",
    body: JSON.stringify({ symbol, assumptions }),
  });

export const fetchFreetrade = () =>
  api<{ connection: BrokerConnection | null; holdings: PortfolioHolding[] }>(
    "/api/brokers/freetrade",
  );

export const importFreetradeCsv = (csv: string, syncWatchlist = true) =>
  api<FreetradeImportResult>("/api/brokers/freetrade/import", {
    method: "POST",
    body: JSON.stringify({ csv, syncWatchlist }),
  });

export const disconnectFreetrade = () =>
  api<{ ok: boolean; deleted: boolean }>("/api/brokers/freetrade", {
    method: "DELETE",
  });

export const fetchPortfolioPerformance = () =>
  api<{ connection: BrokerConnection | null; performance: PortfolioPerformance | null }>(
    "/api/portfolio/performance",
  );

export const fetchMarketCompare = () =>
  api<{ connection: BrokerConnection | null; comparison: MarketCompareResult | null }>(
    "/api/portfolio/vs-market",
  );

export const fetchWhatIf = (key: string) =>
  api<WhatIfResult>(`/api/portfolio/what-if?key=${encodeURIComponent(key)}`);
