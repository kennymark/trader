import "dotenv/config";
import { serve } from "@hono/node-server";
import cron from "node-cron";
import { app } from "./app.js";
import { ensureLocalUser } from "./localUser.js";
import { isAuthEnabled } from "./middleware/auth.js";
import { runAlertCycle } from "./worker/alerts.js";

/**
 * Local / long-running entry point. On Vercel the same app is served by
 * `api/[...path].ts` and alerts fire from a Cron trigger instead of node-cron.
 */
const port = Number(process.env.PORT || 3001);

ensureLocalUser()
  .then(() => {
    serve({ fetch: app.fetch, port }, () => {
      console.log(
        `API listening on http://localhost:${port} (auth ${isAuthEnabled() ? "enabled" : "hidden"})`,
      );
    });

    const cronExpr = process.env.ALERT_CRON || "*/2 * * * *";
    cron.schedule(cronExpr, () => {
      runAlertCycle()
        .then((r) => {
          if (r.fired > 0) console.log(`Alert cycle: checked=${r.checked} fired=${r.fired}`);
        })
        .catch((err) => console.error("Alert cycle failed", err));
    });
  })
  .catch((err) => {
    console.error("Failed to bootstrap local user", err);
    process.exit(1);
  });
