import { handle } from "hono/vercel";
import { app } from "../apps/api/dist/app.js";

export const config = { runtime: "nodejs" };

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export default handler;
