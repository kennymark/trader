import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

export type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/**
 * The signed-in user's id, or null for a guest. The watchlist is browsable
 * signed out, so most read paths tolerate null rather than throwing.
 */
export async function getUserId(ctx: AnyCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

export async function requireUserId(ctx: AnyCtx): Promise<string> {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export function isoOrNull(ms: number | null | undefined): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}
