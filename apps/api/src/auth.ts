import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
const apiOrigin = process.env.API_ORIGIN || "http://localhost:3001";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: apiOrigin,
  trustedOrigins: [
    webOrigin,
    "http://localhost:5173",
    "http://localhost:5174",
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  },
  emailAndPassword: {
    enabled: true,
  },
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};
