import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) {
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` to populate .env.local.");
}

/**
 * One client for the whole app. The provider in router.tsx attaches auth to it,
 * so the plain `convex.query`/`action` calls in queries.ts are authenticated too.
 */
export const convex = new ConvexReactClient(url, { expectAuth: true });
