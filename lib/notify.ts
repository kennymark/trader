import { Resend } from "resend";
import nodemailer from "nodemailer";

export type ChannelConfig = Record<string, unknown>;

/**
 * Email goes out over whichever transport the deployment is configured for.
 * Resend is the least setup; SMTP is there for anyone who would rather send
 * from their own server, or from a provider Resend doesn't cover. Set
 * EMAIL_TRANSPORT to force one, otherwise SMTP wins when a host is configured
 * and Resend when a key is. With neither, sends are logged and not delivered,
 * so a dev deployment never mails anyone by accident.
 */
export type EmailTransport = "smtp" | "resend" | "dry-run";

export function emailTransport(): EmailTransport {
  const forced = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (forced === "smtp" || forced === "resend" || forced === "dry-run") return forced;
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  return "dry-run";
}

function emailFrom() {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    "Stock Alerts <onboarding@resend.dev>"
  );
}

async function sendViaResend(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const { error } = await new Resend(key).emails.send({
    from: emailFrom(),
    to,
    subject,
    text: body,
  });
  // The SDK reports failures in the payload rather than by throwing.
  if (error) throw new Error(`Resend error: ${error.message}`);
  return { ok: true as const };
}

async function sendViaSmtp(to: string, subject: string, body: string) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) throw new Error("SMTP_HOST is not set");
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; everything else starts plain and upgrades.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({ from: emailFrom(), to, subject, text: body });
  return { ok: true as const };
}

export async function sendEmail(to: string, subject: string, body: string) {
  const transport = emailTransport();
  if (transport === "dry-run") {
    console.log(`[email:dry-run] to=${to} subject=${subject} body=${body}`);
    return { ok: true, dryRun: true };
  }
  return transport === "smtp"
    ? sendViaSmtp(to, subject, body)
    : sendViaResend(to, subject, body);
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
