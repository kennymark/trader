import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import {
  addWatchlistSchema,
  analyticsQuerySchema,
  createAlertSchema,
  createChannelSchema,
  historyRangeSchema,
  linkTelegramSchema,
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
import { getHistory, getQuotes, resolveDisplayName, searchSymbols } from "../services/yahoo.js";
import { computeAnalytics } from "../services/analytics.js";

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
