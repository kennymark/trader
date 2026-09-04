import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import {
  addWatchlistSchema,
  analyticsQuerySchema,
  createAlertSchema,
  createChannelSchema,
  historyRangeSchema,
  intelligenceQuerySchema,
  linkTelegramSchema,
  scenarioAssumptionsSchema,
  updateAlertSchema,
  updateChannelSchema,
} from "@trader/shared";
import { db } from "../db/index.js";
import {
  alertEvents,
  alertRules,
  notificationChannels,
  telegramLinkTokens,
  watchlistItems,
} from "../db/schema.js";
import type { AppEnv } from "../middleware/auth.js";
import { withAppUser } from "../middleware/auth.js";
import { getFundamentals, getHistory, getQuotes, resolveDisplayName, searchSymbols } from "../services/yahoo.js";
import { computeAnalytics } from "../services/analytics.js";
import {
  buildIntelligence,
  buildSymbolIntelligence,
  runScenarioSimulator,
} from "../services/intelligence.js";
import {
  getPredictionDashboard,
} from "../services/intelligence/predictions.js";
import { defaultAssumptionsFromFundamentals } from "../services/intelligence/scenarios.js";
import { isDeepSeekEnabled } from "../services/deepseek.js";
import {
  deleteFreetradeConnection,
  getFreetradeConnection,
  getMarketCompare,
  getPortfolioPerformance,
  getWhatIf,
  importFreetradeCsv,
  listPortfolioHoldings,
} from "../services/freetradeImport.js";

function id() {
  return crypto.randomUUID();
}

/** Public market data */
export const publicMarketRoutes = new Hono();

publicMarketRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (q.length < 1) return c.json([]);
  try {
    const results = await searchSymbols(q);
    return c.json(results);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to search symbols" }, 502);
  }
});

publicMarketRoutes.get("/quotes", async (c) => {
  const symbols = (c.req.query("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length === 0) return c.json([]);
  try {
    const quotes = await getQuotes(symbols);
    return c.json(quotes);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to fetch quotes" }, 502);
  }
});

publicMarketRoutes.get("/history/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const range = historyRangeSchema.parse(c.req.query("range") || "1y");
  try {
    const bars = await getHistory(symbol, range);
    return c.json({ symbol, range, bars });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to fetch history" }, 502);
  }
});

publicMarketRoutes.get("/analytics/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const params = analyticsQuerySchema.parse({
    range: c.req.query("range") || "1y",
    amount: c.req.query("amount") || "1000",
    dipPct: c.req.query("dipPct") || "10",
  });
  try {
    const bars = await getHistory(symbol, params.range);
    const analytics = computeAnalytics(
      symbol,
      params.range,
      bars,
      params.amount,
      params.dipPct,
    );
    return c.json(analytics);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to compute analytics" }, 502);
  }
});

/** App routes — auth optional via AUTH_ENABLED */
export const apiRoutes = new Hono<AppEnv>();

apiRoutes.use("*", withAppUser);

apiRoutes.get("/me", async (c) => {
  return c.json({ user: c.get("user") });
});

// --- Brokers / Freetrade ---
apiRoutes.get("/brokers/freetrade", async (c) => {
  const user = c.get("user");
  const connection = await getFreetradeConnection(user.id);
  const holdings = connection ? await listPortfolioHoldings(user.id) : [];
  return c.json({ connection, holdings });
});

apiRoutes.post("/brokers/freetrade/import", async (c) => {
  const user = c.get("user");
  const body = await c
    .req.json<{ csv?: string; syncWatchlist?: boolean }>()
    .catch(() => ({} as { csv?: string; syncWatchlist?: boolean }));
  const csv = body.csv?.trim();
  if (!csv) return c.json({ error: "csv text required" }, 400);

  try {
    const result = await importFreetradeCsv(user.id, csv, {
      syncWatchlist: body.syncWatchlist !== false,
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Failed to import Freetrade CSV";
    return c.json({ error: message }, 400);
  }
});

apiRoutes.delete("/brokers/freetrade", async (c) => {
  const user = c.get("user");
  const result = await deleteFreetradeConnection(user.id);
  return c.json(result);
});

apiRoutes.get("/portfolio/holdings", async (c) => {
  const user = c.get("user");
  const holdings = await listPortfolioHoldings(user.id);
  const connection = await getFreetradeConnection(user.id);
  return c.json({ connection, holdings });
});

apiRoutes.get("/portfolio/performance", async (c) => {
  const user = c.get("user");
  const performance = await getPortfolioPerformance(user.id);
  if (!performance) {
    return c.json({ connection: null, performance: null });
  }
  const connection = await getFreetradeConnection(user.id);
  return c.json({ connection, performance });
});

apiRoutes.get("/portfolio/vs-market", async (c) => {
  const user = c.get("user");
  try {
    const comparison = await getMarketCompare(user.id);
    if (!comparison) {
      return c.json({ connection: null, comparison: null });
    }
    const connection = await getFreetradeConnection(user.id);
    return c.json({ connection, comparison });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Failed to compare vs market";
    return c.json({ error: message }, 500);
  }
});

/** "What if I never sold?" replay for one position (key = ISIN or ticker). */
apiRoutes.get("/portfolio/what-if", async (c) => {
  const user = c.get("user");
  const key = (c.req.query("key") || "").trim();
  if (!key) return c.json({ error: "key query parameter required" }, 400);

  try {
    const result = await getWhatIf(user.id, key);
    if (!result) return c.json({ error: "No broker connection" }, 404);
    if ("ok" in result && result.ok === false) {
      return c.json({ error: result.message, reason: result.reason }, 422);
    }
    return c.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Failed to build what-if";
    return c.json({ error: message }, 500);
  }
});

// --- Intelligence / The Hunt ---
async function resolveIntelligenceSymbols(
  userId: string,
  requested: string[],
): Promise<{ symbols: string[]; source: "watchlist" | "symbols" }> {
  if (requested.length > 0) {
    return { symbols: requested, source: "symbols" };
  }
  const items = await db
    .select({ symbol: watchlistItems.symbol })
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, userId))
    .orderBy(watchlistItems.sortOrder, watchlistItems.createdAt);
  return { symbols: items.map((i) => i.symbol), source: "watchlist" };
}

function emptyIntelligence(source: "watchlist" | "symbols") {
  return {
    generatedAt: new Date().toISOString(),
    source,
    aiEnabled: isDeepSeekEnabled(),
    opportunities: [],
    feed: [],
    catalysts: [],
    portfolio: null,
    recommendations: [],
  };
}

apiRoutes.get("/intelligence", async (c) => {
  const user = c.get("user");
  const parsed = intelligenceQuerySchema.parse({
    symbols: c.req.query("symbols") || undefined,
  });
  const { symbols, source } = await resolveIntelligenceSymbols(user.id, parsed.symbols);
  if (symbols.length === 0) return c.json(emptyIntelligence(source));

  try {
    const result = await buildIntelligence(symbols, source, { userId: user.id });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to build intelligence recommendations" }, 502);
  }
});

apiRoutes.post("/intelligence", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ symbols?: string[] }>().catch(() => ({ symbols: [] as string[] }));
  const requested = [
    ...new Set((body.symbols || []).map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const { symbols, source } = await resolveIntelligenceSymbols(user.id, requested);
  if (symbols.length === 0) return c.json(emptyIntelligence(source));

  try {
    const result = await buildIntelligence(symbols, source, { userId: user.id });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to build intelligence recommendations" }, 502);
  }
});

apiRoutes.get("/intelligence/predictions", async (c) => {
  const user = c.get("user");
  try {
    const dashboard = await getPredictionDashboard(user.id);
    return c.json(dashboard);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to load prediction dashboard" }, 502);
  }
});

apiRoutes.get("/intelligence/portfolio", async (c) => {
  const user = c.get("user");
  const holdingSymbols = (await listPortfolioHoldings(user.id)).map((h) => h.symbol);
  const { symbols, source } =
    holdingSymbols.length > 0
      ? { symbols: holdingSymbols, source: "symbols" as const }
      : await resolveIntelligenceSymbols(user.id, []);
  if (symbols.length === 0) {
    return c.json({
      healthScore: 50,
      holdingsProxy: "watchlist",
      note: "Import a Freetrade activity CSV or add watchlist symbols to score portfolio health.",
      symbolCount: 0,
      strongest: [],
      weakest: [],
      concentration: {
        topSymbolSharePct: null,
        sectorProxy: "Equal-weight watchlist (no sector taxonomy stored)",
        warning: null,
      },
      deteriorating: [],
      improving: [],
      averageOpportunityScore: null,
      averageRiskScore: null,
      holdings: [],
    });
  }
  try {
    const result = await buildIntelligence(symbols, source, {
      userId: user.id,
      persist: false,
    });
    return c.json(result.portfolio);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to build portfolio health" }, 502);
  }
});

apiRoutes.get("/intelligence/catalysts", async (c) => {
  const user = c.get("user");
  const { symbols, source } = await resolveIntelligenceSymbols(user.id, []);
  if (symbols.length === 0) return c.json({ generatedAt: new Date().toISOString(), catalysts: [] });
  try {
    const result = await buildIntelligence(symbols, source, {
      userId: user.id,
      persist: false,
    });
    return c.json({ generatedAt: result.generatedAt, catalysts: result.catalysts });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to load catalysts" }, 502);
  }
});

apiRoutes.post("/intelligence/scenarios", async (c) => {
  const body = await c.req
    .json<{
      symbol?: string;
      assumptions?: Record<string, unknown>;
    }>()
    .catch(() => ({} as { symbol?: string; assumptions?: Record<string, unknown> }));
  const symbol = String(body.symbol || "")
    .trim()
    .toUpperCase();
  if (!symbol) return c.json({ error: "symbol required" }, 400);

  try {
    const assumptions = scenarioAssumptionsSchema.parse(body.assumptions || {});
    const [quotes, fundamentals] = await Promise.all([
      getQuotes([symbol]),
      getFundamentals(symbol),
    ]);
    const quote = quotes[0];
    const merged = {
      ...defaultAssumptionsFromFundamentals({
        trailingPe: fundamentals.trailingPe,
        forwardPe: fundamentals.forwardPe,
        profitMargins: fundamentals.profitMargins,
      }),
      ...assumptions,
    };
    const result = runScenarioSimulator({
      symbol,
      currentPrice: quote?.price ?? null,
      currency: quote?.currency,
      trailingEps: fundamentals.trailingEps,
      assumptions: merged,
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to simulate scenarios" }, 502);
  }
});

apiRoutes.get("/intelligence/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  try {
    const detail = await buildSymbolIntelligence(symbol);
    return c.json(detail);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to build symbol intelligence" }, 502);
  }
});

// --- Watchlist ---
apiRoutes.get("/watchlist", async (c) => {
  const user = c.get("user");
  const items = await db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, user.id))
    .orderBy(watchlistItems.sortOrder, watchlistItems.createdAt);
  return c.json(
    items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
  );
});

apiRoutes.post("/watchlist", async (c) => {
  const user = c.get("user");
  const body = addWatchlistSchema.parse(await c.req.json());
  const displayName = await resolveDisplayName(body.symbol);
  const item = {
    id: id(),
    userId: user.id,
    symbol: body.symbol,
    displayName,
    sortOrder: 0,
  };
  try {
    await db.insert(watchlistItems).values(item);
  } catch {
    return c.json({ error: "Symbol already on watchlist" }, 409);
  }
  return c.json({ ...item, createdAt: new Date().toISOString() }, 201);
});

apiRoutes.post("/watchlist/sync", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ symbols?: string[] }>();
  const symbols = [
    ...new Set((body.symbols || []).map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const saved: string[] = [];
  for (const symbol of symbols) {
    const displayName = await resolveDisplayName(symbol);
    try {
      await db.insert(watchlistItems).values({
        id: id(),
        userId: user.id,
        symbol,
        displayName,
        sortOrder: 0,
      });
      saved.push(symbol);
    } catch {
      // already exists
    }
  }
  return c.json({ saved });
});

apiRoutes.delete("/watchlist/:id", async (c) => {
  const user = c.get("user");
  const itemId = c.req.param("id");
  await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, user.id)));
  return c.json({ ok: true });
});

// --- Channels ---
apiRoutes.get("/channels", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, user.id))
    .orderBy(desc(notificationChannels.createdAt));
  return c.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

apiRoutes.post("/channels", async (c) => {
  const user = c.get("user");
  const body = createChannelSchema.parse(await c.req.json());

  if (body.type === "email" && !body.config.address) {
    body.config.address = user.email;
  }

  const row = {
    id: id(),
    userId: user.id,
    symbol: body.symbol,
    type: body.type,
    label: body.label,
    config: body.config,
    enabled: body.enabled ?? true,
  };
  await db.insert(notificationChannels).values(row);
  return c.json({ ...row, createdAt: new Date().toISOString() }, 201);
});

apiRoutes.patch("/channels/:id", async (c) => {
  const user = c.get("user");
  const channelId = c.req.param("id");
  const body = updateChannelSchema.parse(await c.req.json());
  const [existing] = await db
    .select()
    .from(notificationChannels)
    .where(
      and(eq(notificationChannels.id, channelId), eq(notificationChannels.userId, user.id)),
    );
  if (!existing) return c.json({ error: "Not found" }, 404);

  const updated = {
    label: body.label ?? existing.label,
    config: body.config ?? existing.config,
    enabled: body.enabled ?? existing.enabled,
    symbol: body.symbol ?? existing.symbol,
  };
  await db
    .update(notificationChannels)
    .set(updated)
    .where(eq(notificationChannels.id, channelId));
  return c.json({
    ...existing,
    ...updated,
    createdAt: existing.createdAt.toISOString(),
  });
});

apiRoutes.delete("/channels/:id", async (c) => {
  const user = c.get("user");
  await db
    .delete(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, c.req.param("id")),
        eq(notificationChannels.userId, user.id),
      ),
    );
  return c.json({ ok: true });
});

apiRoutes.post("/channels/telegram/link", async (c) => {
  const user = c.get("user");
  const body = linkTelegramSchema.parse(await c.req.json().catch(() => ({})));
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "YourStockAlertsBot";
  await db.insert(telegramLinkTokens).values({
    id: id(),
    userId: user.id,
    symbol: body.symbol,
    token,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return c.json({
    token,
    deepLink: `https://t.me/${botUsername}?start=${token}`,
    expiresInMinutes: 15,
    symbol: body.symbol,
  });
});

// --- Alerts ---
apiRoutes.get("/alerts", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.userId, user.id))
    .orderBy(desc(alertRules.createdAt));
  return c.json(
    rows.map((r) => ({
      ...r,
      threshold: Number(r.threshold),
      lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

apiRoutes.post("/alerts", async (c) => {
  const user = c.get("user");
  const body = createAlertSchema.parse(await c.req.json());

  const userChannels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, user.id));
  const allowed = new Set(
    userChannels
      .filter((ch) => (ch.symbol || "").toUpperCase() === body.symbol)
      .map((ch) => ch.id),
  );
  if (!body.channelIds.every((id) => allowed.has(id))) {
    return c.json({ error: "Channels must belong to this symbol" }, 400);
  }

  const row = {
    id: id(),
    userId: user.id,
    symbol: body.symbol,
    kind: body.kind,
    threshold: String(body.threshold),
    baseline: body.baseline,
    baselineWindowDays: body.baselineWindowDays ?? null,
    channelIds: body.channelIds,
    cooldownMinutes: body.cooldownMinutes,
    enabled: body.enabled ?? true,
  };
  await db.insert(alertRules).values(row);
  return c.json(
    {
      ...row,
      threshold: body.threshold,
      lastTriggeredAt: null,
      createdAt: new Date().toISOString(),
    },
    201,
  );
});

apiRoutes.patch("/alerts/:id", async (c) => {
  const user = c.get("user");
  const alertId = c.req.param("id");
  const body = updateAlertSchema.parse(await c.req.json());
  const [existing] = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.id, alertId), eq(alertRules.userId, user.id)));
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch = {
    symbol: body.symbol ?? existing.symbol,
    kind: body.kind ?? existing.kind,
    threshold: body.threshold != null ? String(body.threshold) : existing.threshold,
    baseline: body.baseline ?? existing.baseline,
    baselineWindowDays:
      body.baselineWindowDays !== undefined
        ? body.baselineWindowDays
        : existing.baselineWindowDays,
    channelIds: body.channelIds ?? existing.channelIds,
    cooldownMinutes: body.cooldownMinutes ?? existing.cooldownMinutes,
    enabled: body.enabled ?? existing.enabled,
  };
  await db.update(alertRules).set(patch).where(eq(alertRules.id, alertId));
  return c.json({
    ...existing,
    ...patch,
    threshold: Number(patch.threshold),
    lastTriggeredAt: existing.lastTriggeredAt?.toISOString() ?? null,
    createdAt: existing.createdAt.toISOString(),
  });
});

apiRoutes.delete("/alerts/:id", async (c) => {
  const user = c.get("user");
  await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, c.req.param("id")), eq(alertRules.userId, user.id)));
  return c.json({ ok: true });
});

apiRoutes.get("/alerts/events", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.userId, user.id))
    .orderBy(desc(alertEvents.createdAt))
    .limit(50);
  return c.json(
    rows.map((r) => ({
      ...r,
      price: Number(r.price),
      createdAt: r.createdAt.toISOString(),
    })),
  );
});
