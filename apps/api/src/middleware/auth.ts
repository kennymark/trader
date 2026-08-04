import { createMiddleware } from "hono/factory";
import { auth, type SessionUser } from "./auth.js";

export type AppEnv = {
  Variables: {
    user: SessionUser;
    session: { id: string; userId: string };
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user as SessionUser);
  c.set("session", { id: session.session.id, userId: session.user.id });
  await next();
});
