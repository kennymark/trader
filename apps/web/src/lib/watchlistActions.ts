import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth";
import { AUTH_ENABLED } from "./features";
import { addGuestSymbol, getGuestWatchlist } from "./guestWatchlist";
import { addWatchlist, fetchWatchlist } from "./queries";

/**
 * Watchlist membership plus an add, for surfaces outside the watchlist pane
 * itself. Signed out, the list lives in localStorage; signed in, on the server.
 */
export function useWatchlist() {
  const qc = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const useGuest = AUTH_ENABLED && !session?.user;

  const watchlist = useQuery({
    queryKey: ["watchlist", useGuest ? "guest" : "server"],
    queryFn: async () => (useGuest ? getGuestWatchlist() : fetchWatchlist()),
    enabled: !AUTH_ENABLED || !sessionPending,
  });

  const symbols = new Set((watchlist.data ?? []).map((w) => w.symbol.toUpperCase()));

  const add = useMutation({
    mutationFn: async ({ symbol, displayName }: { symbol: string; displayName?: string | null }) => {
      const ticker = symbol.trim().toUpperCase();
      if (!ticker) throw new Error("symbol required");
      return useGuest
        ? addGuestSymbol(ticker, displayName ?? null)
        : await addWatchlist(ticker, displayName ?? undefined);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return {
    ready: watchlist.isFetched,
    isWatching: (symbol: string) => symbols.has(symbol.trim().toUpperCase()),
    add,
  };
}
