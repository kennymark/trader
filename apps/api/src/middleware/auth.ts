import { createMiddleware } from "hono/factory";
import { auth, type SessionUser } from "../auth.js";
import { ensureLocalUser } from "../localUser.js";

export type AppEnv = {
  Variables: {
    user: SessionUser;
    session?: { id: string; userId: string };
  };
};

/** Flip to true (AUTH_ENABLED=true) to require real sessions again. */
export const isAuthEnabled = () =>
  process.env.AUTH_ENABLED === "true" || process.env.AUTH_ENABLED === "1";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user as SessionUser);
  c.set("session", { id: session.session.id, userId: session.user.id });
  await next();
});

/** No-login path: every request is scoped to the single local user. */
export const withLocalUser = createMiddleware<AppEnv>(async (c, next) => {
  const local = await ensureLocalUser();
  c.set("user", local);
  await next();
});

/** Uses session auth when enabled; otherwise the local user. */
export const withAppUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAuthEnabled()) {
    const local = await ensureLocalUser();
    c.set("user", local);
    await next();
    return;
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user as SessionUser);
  c.set("session", { id: session.session.id, userId: session.user.id });
  await next();
});
