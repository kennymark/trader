// Exercises the real persister + shouldPersist against a QueryClient, then
// restores into a fresh client — the same round trip the app does on reload.
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
const persister = createSyncStoragePersister({ storage, key: "trader:query-cache" });
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const PERSISTED = new Set(["portfolio-performance", "intelligence", "watchlist"]);
const shouldDehydrateQuery = (q) =>
  typeof q.queryKey[0] === "string" && PERSISTED.has(q.queryKey[0]) && q.state.status === "success";

const a = new QueryClient({ defaultOptions: { queries: { gcTime: MAX_AGE } } });
const [unsubA] = persistQueryClient({ queryClient: a, persister, maxAge: MAX_AGE, dehydrateOptions: { shouldDehydrateQuery } });
await a.prefetchQuery({ queryKey: ["portfolio-performance"], queryFn: async () => ({ performance: { totalPnl: 1234.5 } }) });
await a.prefetchQuery({ queryKey: ["intelligence", "watchlist"], queryFn: async () => ({ catalysts: [{ id: "e1" }] }) });
await a.prefetchQuery({ queryKey: ["quotes", "NVDA"], queryFn: async () => [{ symbol: "NVDA", price: 900 }] });
await new Promise((r) => setTimeout(r, 1500));
unsubA?.();

// Fresh client, no network: restore only.
const b = new QueryClient({ defaultOptions: { queries: { gcTime: MAX_AGE } } });
const [, restored] = persistQueryClient({ queryClient: b, persister, maxAge: MAX_AGE, dehydrateOptions: { shouldDehydrateQuery } });
await restored;

console.log("portfolio:", JSON.stringify(b.getQueryData(["portfolio-performance"])));
console.log("calendar :", JSON.stringify(b.getQueryData(["intelligence", "watchlist"])));
console.log("quotes   :", JSON.stringify(b.getQueryData(["quotes", "NVDA"])) ?? "undefined");
console.log("bytes    :", storage.getItem("trader:query-cache").length);
