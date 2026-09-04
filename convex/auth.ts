import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
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

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.getAuthUser(ctx),
});
