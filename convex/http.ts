import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// cors: true is required for a browser SPA on a different origin.
authComponent.registerRoutes(http, createAuth, { cors: true });

/** Telegram bot webhook: /start <token> links a chat to a notification channel. */
http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const update = (await request.json()) as {
      message?: { chat?: { id?: number }; text?: string };
    };
    const text = update.message?.text || "";
    const chatId = update.message?.chat?.id;
    const token = text.startsWith("/start") ? text.split(/\s+/)[1] : undefined;

    if (chatId && token) {
      const { linked } = await ctx.runMutation(internal.channels.redeemTelegramToken, {
        token,
        chatId: String(chatId),
      });
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (linked && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Linked! You will receive stock alerts here.",
          }),
        }).catch(() => undefined);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
