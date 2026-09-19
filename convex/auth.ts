import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

/**
 * Better Auth runs inside Convex. The SPA is served from a different origin than
 * the `.convex.site` auth endpoints, so the cross-domain plugin pair is required
 * (the Next.js setup in the docs does not need it).
 */
const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";

/**
 * Origins allowed to call the auth endpoints. Vite silently moves to the next
 * free port when 5173 is taken, and an untrusted origin fails as an opaque CORS
 * error rather than a useful message, so the usual dev ports are trusted too.
 * TRUSTED_ORIGINS adds more as a comma-separated list.
 */
const trustedOrigins = [
  ...new Set([
    siteUrl,
    ...(siteUrl.includes("localhost")
      ? ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"]
      : []),
    ...(process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]),
];

/** How long a password reset link stays usable. */
const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      // A reset is the remedy for a password someone else may know, so the
      // sessions opened with the old one should not survive it.
      revokeSessionsOnPasswordReset: true,
      /**
       * Better Auth's own `url` points at the `.convex.site` callback, which
       * then redirects to the SPA. Linking straight to the SPA with the token
       * skips that hop, and keeps the email pointing at the app's own origin.
       * The email itself goes out from a Node action (see convex/authEmails.ts).
       */
      sendResetPassword: async ({ user, token }) => {
        const url = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
        if (!("scheduler" in ctx)) {
          throw new Error("Cannot send a password reset email from this context");
        }
        await ctx.scheduler.runAfter(0, internal.authEmails.sendPasswordReset, {
          to: user.email,
          name: user.name,
          url,
          expiresInMinutes: Math.round(RESET_PASSWORD_TTL_SECONDS / 60),
        });
      },
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.getAuthUser(ctx),
});
