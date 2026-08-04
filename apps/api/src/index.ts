import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, gt } from "drizzle-orm";
import cron from "node-cron";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { notificationChannels, telegramLinkTokens } from "./db/schema.js";
import { apiRoutes, publicMarketRoutes } from "./routes/api.js";
import { runAlertCycle } from "./worker/alerts.js";

const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
const port = Number(process.env.PORT || 3001);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [webOrigin, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true }));

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
    type: "telegram",
    label: "Telegram",
    config: { chatId: String(chatId) },
    enabled: true,
  });

  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.id, link.id));

  // Ack to user via Telegram if token configured
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

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});

const cronExpr = process.env.ALERT_CRON || "*/2 * * * *";
cron.schedule(cronExpr, () => {
  runAlertCycle()
    .then((r) => {
      if (r.fired > 0) console.log(`Alert cycle: checked=${r.checked} fired=${r.fired}`);
    })
    .catch((err) => console.error("Alert cycle failed", err));
});
