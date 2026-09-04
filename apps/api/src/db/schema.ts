import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    displayName: text("display_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_user_symbol").on(t.userId, t.symbol)],
);

export const notificationChannels = pgTable("notification_channels", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Stock ticker this channel belongs to; null = legacy/global. */
  symbol: text("symbol"),
  type: text("type").notNull(), // email | telegram | twist
  label: text("label").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  kind: text("kind").notNull(), // above | below | pct_drop | pct_rise
  threshold: numeric("threshold", { precision: 18, scale: 6 }).notNull(),
  baseline: text("baseline").notNull().default("prev_close"),
  baselineWindowDays: integer("baseline_window_days"),
  channelIds: jsonb("channel_ids").$type<string[]>().notNull().default([]),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const alertEvents = pgTable("alert_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ruleId: text("rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  price: numeric("price", { precision: 18, scale: 6 }).notNull(),
  message: text("message").notNull(),
  channels: jsonb("channels").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("sent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Symbol the resulting Telegram channel should be bound to. */
  symbol: text("symbol"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Point-in-time opportunity scores for watchlist / hunt runs */
export const opportunitySnapshots = pgTable("opportunity_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  opportunityScore: integer("opportunity_score").notNull(),
  riskScore: integer("risk_score").notNull(),
  convictionScore: integer("conviction_score").notNull(),
  price: numeric("price", { precision: 18, scale: 6 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PredictionEvaluationRow = {
  horizonDays: 7 | 30 | 90 | 180 | 365;
  dueAt: string;
  evaluatedAt: string | null;
  priceAtEval: number | null;
  returnPct: number | null;
  hitTarget: boolean | null;
};

/** Persisted theses / scores for prediction tracking */
export const intelligencePredictions = pgTable("intelligence_predictions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  thesis: text("thesis").notNull(),
  action: text("action").notNull(),
  opportunityScore: integer("opportunity_score").notNull(),
  convictionScore: integer("conviction_score").notNull(),
  priceAtPrediction: numeric("price_at_prediction", { precision: 18, scale: 6 }),
  targetPrice: numeric("target_price", { precision: 18, scale: 6 }),
  predictedAt: timestamp("predicted_at").notNull().defaultNow(),
  evaluations: jsonb("evaluations")
    .$type<PredictionEvaluationRow[]>()
    .notNull()
    .default([]),
});

/** Feed / happening events surfaced to the user */
export const intelligenceFeedEvents = pgTable("intelligence_feed_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  symbol: text("symbol"),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  score: integer("score"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Linked broker sources (Freetrade CSV today — no public Freetrade API) */
export const brokerConnections = pgTable(
  "broker_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // freetrade
    label: text("label").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    transactionCount: integer("transaction_count").notNull().default(0),
    holdingCount: integer("holding_count").notNull().default(0),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("broker_user_provider").on(t.userId, t.provider)],
);

export const brokerTransactions = pgTable(
  "broker_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => brokerConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    type: text("type").notNull(),
    side: text("side"), // buy | sell | null
    symbol: text("symbol"),
    isin: text("isin"),
    title: text("title"),
    account: text("account"),
    quantity: numeric("quantity", { precision: 24, scale: 8 }),
    price: numeric("price", { precision: 18, scale: 6 }),
    totalAmount: numeric("total_amount", { precision: 18, scale: 6 }),
    currency: text("currency"),
    tradedAt: timestamp("traded_at"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("broker_tx_connection_external").on(t.connectionId, t.externalId)],
);

export const portfolioHoldings = pgTable(
  "portfolio_holdings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => brokerConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    symbol: text("symbol").notNull(),
    displayName: text("display_name"),
    isin: text("isin"),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    averageCost: numeric("average_cost", { precision: 18, scale: 6 }),
    costBasis: numeric("cost_basis", { precision: 18, scale: 6 }),
    currency: text("currency").notNull().default("GBP"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("portfolio_holdings_user_provider_symbol").on(t.userId, t.provider, t.symbol)],
);
