"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { sendEmail } from "../lib/notify";

/**
 * Auth emails live in a Node action because the transports in lib/notify use
 * nodemailer, which the default Convex runtime cannot load. convex/auth.ts runs
 * in the V8 runtime (it is imported by http.ts), so it schedules this instead of
 * sending directly.
 */
export const sendPasswordReset = internalAction({
  args: {
    to: v.string(),
    name: v.optional(v.string()),
    url: v.string(),
    expiresInMinutes: v.number(),
  },
  handler: async (_ctx, { to, name, url, expiresInMinutes }) => {
    const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
    await sendEmail(
      to,
      "Reset your Trader password",
      [
        greeting,
        "",
        "Use the link below to choose a new password:",
        url,
        "",
        `The link expires in ${expiresInMinutes} minutes and can only be used once.`,
        "If you did not ask for a password reset, you can ignore this email — your password stays the same.",
      ].join("\n"),
    );
  },
});
