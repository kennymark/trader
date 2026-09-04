/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alertCycle from "../alertCycle.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as channels from "../channels.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as intelligence from "../intelligence.js";
import type * as intelligenceActions from "../intelligenceActions.js";
import type * as market from "../market.js";
import type * as portfolio from "../portfolio.js";
import type * as portfolioActions from "../portfolioActions.js";
import type * as preferences from "../preferences.js";
import type * as users from "../users.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alertCycle: typeof alertCycle;
  alerts: typeof alerts;
  auth: typeof auth;
  channels: typeof channels;
  chat: typeof chat;
  chatActions: typeof chatActions;
  crons: typeof crons;
  http: typeof http;
  intelligence: typeof intelligence;
  intelligenceActions: typeof intelligenceActions;
  market: typeof market;
  portfolio: typeof portfolio;
  portfolioActions: typeof portfolioActions;
  preferences: typeof preferences;
  users: typeof users;
  watchlist: typeof watchlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
