import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Serverless invocations are short-lived and numerous, so hold one connection each
 * and let the platform pooler (Neon's -pooler host) do the multiplexing. Prepared
 * statements are disabled because pgbouncer in transaction mode cannot keep them.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const client = postgres(connectionString, {
  max: isServerless ? 1 : 10,
  prepare: !isServerless,
  idle_timeout: isServerless ? 20 : undefined,
});
export const db = drizzle(client, { schema });
