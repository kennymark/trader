import { Resend } from "resend";

export type ChannelConfig = Record<string, unknown>;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendEmail(to: string, subject: string, body: string) {
  const resend = getResend();
  const from = process.env.EMAIL_FROM || "Stock Alerts <onboarding@resend.dev>";
  if (!resend) {
    console.log(`[email:dry-run] to=${to} subject=${subject} body=${body}`);
    return { ok: true, dryRun: true };
  }
  await resend.emails.send({
    from,
    to,
    subject,
    text: body,
  });
  return { ok: true };
}

export async function sendTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(`[telegram:dry-run] chatId=${chatId} message=${message}`);
    return { ok: true, dryRun: true };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram error: ${res.status} ${text}`);
  }
  return { ok: true };
}

export async function sendTwist(
  config: { accessToken: string; conversationId: string },
  message: string,
) {
  const token = config.accessToken || process.env.TWIST_ACCESS_TOKEN;
  if (!token || !config.conversationId) {
    console.log(`[twist:dry-run] conversation=${config.conversationId} message=${message}`);
    return { ok: true, dryRun: true };
  }
  const res = await fetch("https://api.twist.com/api/v3/comments/add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: Number(config.conversationId),
      content: message,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twist error: ${res.status} ${text}`);
  }
  return { ok: true };
}

export async function deliverToChannel(
  type: string,
  config: ChannelConfig,
  subject: string,
  message: string,
) {
  switch (type) {
    case "email": {
      const to = String(config.address || "");
      if (!to) throw new Error("Email channel missing address");
      return sendEmail(to, subject, message);
    }
    case "telegram": {
      const chatId = String(config.chatId || "");
      if (!chatId) throw new Error("Telegram channel missing chatId");
      return sendTelegram(chatId, `${subject}\n\n${message}`);
    }
    case "twist": {
      return sendTwist(
        {
          accessToken: String(config.accessToken || ""),
          conversationId: String(config.conversationId || config.threadId || ""),
        },
        `**${subject}**\n${message}`,
      );
    }
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}
