import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

/**
 * Better Auth runs inside Convex, on the deployment's `.convex.site` origin.
 * That is a different origin from the app, hence the cross-domain plugin.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient()],
});
