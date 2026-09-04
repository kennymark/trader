import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { removeOldestQuery } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";

/**
 * Query keys worth keeping on disk. Deliberately a short list: these are the
 * answers you would still want to read on a train with no signal, and each is
 * bounded in size. Live quotes are excluded — a stale price shown as current is
 * worse than no price.
 */
const PERSISTED = new Set([
  "portfolio-performance",
  "portfolio-vs-market",
  "freetrade",
  "intelligence",
  "predictions",
  "watchlist",
  "preferences",
]);

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function shouldPersist(query: Query): boolean {
  const root = query.queryKey[0];
  return (
    typeof root === "string" && PERSISTED.has(root) && query.state.status === "success"
  );
}

export const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "trader:query-cache",
  // A large portfolio can outgrow the localStorage quota; drop the oldest
  // entries rather than losing the whole cache.
  retry: removeOldestQuery,
});
