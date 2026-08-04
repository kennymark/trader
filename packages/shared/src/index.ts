import { z } from "zod";

export const historyRangeSchema = z.enum(["1m", "3m", "1y", "5y", "max"]);
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

export type NotificationChannel = {
  id: string;
  symbol: string | null;
  type: ChannelType;
  label: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type AlertRule = {
  id: string;
  symbol: string;
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
