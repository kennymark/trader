import { handle } from "hono/vercel";
import { app } from "../apps/api/dist/app.js";

export const config = { runtime: "nodejs" };

/**
 * Named HTTP exports opt into Vercel's Web `fetch` signature. A default export
 * would be invoked as `(req, res)` instead, which Hono cannot consume.
 */
const handler = handle(app);

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
