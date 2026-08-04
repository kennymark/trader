import type {
  AlertEvent,
  AlertRule,
  AnalyticsResult,
  HistoryBar,
  HistoryRange,
  NotificationChannel,
  Quote,
  WatchlistItem,
} from "@trader/shared";
import { api } from "./api";

export const fetchMe = () => api<{ user: { id: string; name: string; email: string; image?: string | null } }>("/api/me");

export const fetchWatchlist = () => api<WatchlistItem[]>("/api/watchlist");

export const addWatchlist = (symbol: string) =>
  api<WatchlistItem>("/api/watchlist", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });

export const removeWatchlist = (id: string) =>
  api<{ ok: boolean }>(`/api/watchlist/${id}`, { method: "DELETE" });

export const fetchQuotes = (symbols: string[]) =>
  api<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);

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
}) =>
  api<NotificationChannel>("/api/channels", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateChannel = (
  id: string,
  body: Partial<{ label: string; config: Record<string, unknown>; enabled: boolean }>,
) =>
  api<NotificationChannel>(`/api/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteChannel = (id: string) =>
  api<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" });

export const linkTelegram = () =>
  api<{ token: string; deepLink: string; expiresInMinutes: number }>(
    "/api/channels/telegram/link",
    { method: "POST" },
  );

export const fetchAlerts = () => api<AlertRule[]>("/api/alerts");

export const createAlert = (body: unknown) =>
  api<AlertRule>("/api/alerts", { method: "POST", body: JSON.stringify(body) });

export const updateAlert = (id: string, body: unknown) =>
  api<AlertRule>(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAlert = (id: string) =>
  api<{ ok: boolean }>(`/api/alerts/${id}`, { method: "DELETE" });

export const fetchAlertEvents = () => api<AlertEvent[]>("/api/alerts/events");
