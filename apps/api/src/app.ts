import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, gt } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { notificationChannels, telegramLinkTokens } from "./db/schema.js";
import { isAuthEnabled } from "./middleware/auth.js";
import { apiRoutes, publicMarketRoutes } from "./routes/api.js";
import { runAlertCycle } from "./worker/alerts.js";

const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

/** Same-origin deployments need no CORS entry; these cover local dev and a split origin. */
const allowedOrigins = [
  webOrigin,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Auth handlers stay mounted so re-enabling AUTH_ENABLED just works.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const health = (c: { json: (v: unknown) => Response }) =>
  c.json({ ok: true, authEnabled: isAuthEnabled() });

app.get("/health", health);
app.get("/api/health", health);

/**
 * Alert delivery. Runs from node-cron locally and from a Vercel Cron trigger in
 * production, where the platform sends `Authorization: Bearer $CRON_SECRET`.
 */
app.get("/api/cron/alerts", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (secret && c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "Forbidden" }, 403);
  }
  try {
    const result = await runAlertCycle();
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error("Alert cycle failed", err);
    return c.json({ error: "Alert cycle failed" }, 500);
  }
});

// Telegram bot webhook (public)
app.post("/api/telegram/webhook", async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && c.req.header("x-telegram-bot-api-secret-token") !== secret) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const update = await c.req.json<{
    message?: { chat?: { id?: number }; text?: string };
  }>();
  const text = update.message?.text || "";
  const chatId = update.message?.chat?.id;
  if (!chatId || !text.startsWith("/start")) {
    return c.json({ ok: true });
  }

  const token = text.split(/\s+/)[1];
  if (!token) {
    return c.json({ ok: true });
  }

  const [link] = await db
    .select()
    .from(telegramLinkTokens)
    .where(
      and(eq(telegramLinkTokens.token, token), gt(telegramLinkTokens.expiresAt, new Date())),
    );

  if (!link) {
    return c.json({ ok: true });
  }

  await db.insert(notificationChannels).values({
    id: crypto.randomUUID(),
    userId: link.userId,
    symbol: link.symbol,
    type: "telegram",
    label: link.symbol ? `Telegram · ${link.symbol}` : "Telegram",
    config: { chatId: String(chatId) },
    enabled: true,
  });

  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.id, link.id));

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Linked! You will receive stock alerts here.",
      }),
    }).catch(() => undefined);
  }

  return c.json({ ok: true });
});

app.route("/api", publicMarketRoutes);
app.route("/api", apiRoutes);
