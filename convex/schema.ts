import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Application tables. Users, sessions and accounts are owned by the Better Auth
 * component and are not declared here.
 *
 * Two conventions carried over from the Postgres schema:
 *  - `userId` is the Better Auth user id, stored as a string.
 *  - Timestamps are epoch milliseconds, since Convex has no date type.
 */
export default defineSchema({
  watchlistItems: defineTable({
    userId: v.string(),
    symbol: v.string(),
    displayName: v.union(v.string(), v.null()),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_symbol", ["userId", "symbol"]),

  notificationChannels: defineTable({
    userId: v.string(),
    /** Ticker this channel belongs to; null means legacy/global. */
    symbol: v.union(v.string(), v.null()),
    type: v.string(), // email | telegram | twist
    label: v.string(),
    config: v.any(),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_symbol", ["userId", "symbol"]),

  alertRules: defineTable({
    userId: v.string(),
    symbol: v.string(),
    kind: v.string(), // above | below | pct_drop | pct_rise
    threshold: v.number(),
    baseline: v.string(),
    baselineWindowDays: v.union(v.number(), v.null()),
    channelIds: v.array(v.string()),
    cooldownMinutes: v.number(),
    enabled: v.boolean(),
    lastTriggeredAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_enabled", ["enabled"]),

  alertEvents: defineTable({
    userId: v.string(),
    ruleId: v.string(),
    symbol: v.string(),
    price: v.number(),
    message: v.string(),
    channels: v.array(v.string()),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_rule", ["ruleId"]),

  telegramLinkTokens: defineTable({
    userId: v.string(),
    symbol: v.union(v.string(), v.null()),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  opportunitySnapshots: defineTable({
    userId: v.string(),
    symbol: v.string(),
    opportunityScore: v.number(),
    riskScore: v.number(),
    convictionScore: v.number(),
    price: v.union(v.number(), v.null()),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_symbol", ["userId", "symbol"]),

  intelligencePredictions: defineTable({
    userId: v.string(),
    symbol: v.string(),
    thesis: v.string(),
    action: v.string(),
    opportunityScore: v.number(),
    convictionScore: v.number(),
    priceAtPrediction: v.union(v.number(), v.null()),
    targetPrice: v.union(v.number(), v.null()),
    predictedAt: v.number(),
    evaluations: v.array(
      v.object({
        horizonDays: v.number(),
        dueAt: v.string(),
        evaluatedAt: v.union(v.string(), v.null()),
        priceAtEval: v.union(v.number(), v.null()),
        returnPct: v.union(v.number(), v.null()),
        hitTarget: v.union(v.boolean(), v.null()),
      }),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_user_symbol", ["userId", "symbol"]),

  intelligenceFeedEvents: defineTable({
    userId: v.string(),
    symbol: v.union(v.string(), v.null()),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    score: v.union(v.number(), v.null()),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  brokerConnections: defineTable({
    userId: v.string(),
    provider: v.string(), // freetrade
    label: v.string(),
    lastSyncedAt: v.union(v.number(), v.null()),
    transactionCount: v.number(),
    holdingCount: v.number(),
    meta: v.any(),
    createdAt: v.number(),
  }).index("by_user_provider", ["userId", "provider"]),

  brokerTransactions: defineTable({
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    provider: v.string(),
    externalId: v.union(v.string(), v.null()),
    type: v.string(),
    side: v.union(v.string(), v.null()), // buy | sell | null
    symbol: v.union(v.string(), v.null()),
    isin: v.union(v.string(), v.null()),
    title: v.union(v.string(), v.null()),
    account: v.union(v.string(), v.null()),
    quantity: v.union(v.number(), v.null()),
    price: v.union(v.number(), v.null()),
    totalAmount: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    tradedAt: v.union(v.number(), v.null()),
    raw: v.any(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"]),

  chatMessages: defineTable({
    userId: v.string(),
    role: v.string(), // user | assistant
    content: v.string(),
    /** Which model answered, so an old thread still says where it came from. */
    provider: v.union(v.string(), v.null()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  portfolioHoldings: defineTable({
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    provider: v.string(),
    symbol: v.string(),
    displayName: v.union(v.string(), v.null()),
    isin: v.union(v.string(), v.null()),
    quantity: v.number(),
    averageCost: v.union(v.number(), v.null()),
    costBasis: v.union(v.number(), v.null()),
    currency: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider_symbol", ["userId", "provider", "symbol"]),
});
