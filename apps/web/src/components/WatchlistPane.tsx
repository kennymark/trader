import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { Quote, WatchlistItem } from "@trader/shared";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { getGuestWatchlist, removeGuestSymbol } from "../lib/guestWatchlist";
import { fetchQuotes, fetchWatchlist, removeWatchlist } from "../lib/queries";
import { usePreferences } from "../lib/preferences";

type Props = {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  /** Lets the page open the first symbol so the chart pane is never a blank void. */
  onSymbolsLoaded?: (symbols: string[]) => void;
};

export function WatchlistPane({
  selectedSymbol,
  onSelect,
  onSymbolsLoaded,
}: Props) {
  const qc = useQueryClient();
  const { prefs } = usePreferences();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);
  const useGuest = AUTH_ENABLED && !session?.user;

  const watchlist = useQuery({
    queryKey: ["watchlist", useGuest ? "guest" : "server"],
    queryFn: async () => {
      if (useGuest) return getGuestWatchlist();
      return fetchWatchlist();
    },
    enabled: !AUTH_ENABLED || !sessionPending,
  });

  const symbols = (watchlist.data || []).map((w) => w.symbol);

  const notifiedRef = useRef<string>("");
  useEffect(() => {
    const key = symbols.join(",");
    if (!key || notifiedRef.current === key) return;
    notifiedRef.current = key;
    onSymbolsLoaded?.(symbols);
  }, [symbols, onSymbolsLoaded]);

  const quotes = useQuery({
    queryKey: ["quotes", symbols.join(",")],
    queryFn: () => fetchQuotes(symbols),
    enabled: symbols.length > 0,
    // 0 seconds means the reader turned polling off.
    refetchInterval: prefs.quoteRefreshSeconds > 0 ? prefs.quoteRefreshSeconds * 1000 : false,
    staleTime: 30_000,
  });

  // Drop stale restored selection once watchlist is known.
  useEffect(() => {
    if (!watchlist.isFetched || (AUTH_ENABLED && sessionPending)) return;
    if (watchlist.isError && !useGuest) return;

    const items = watchlist.data ?? [];
    if (
      selectedSymbol &&
      (items.length === 0 || !items.some((w) => w.symbol === selectedSymbol))
    ) {
      onSelect("");
    }
  }, [
    watchlist.isFetched,
    watchlist.isError,
    watchlist.data,
    sessionPending,
    useGuest,
    selectedSymbol,
    onSelect,
  ]);

  const quoteMap = new Map((quotes.data || []).map((q) => [q.symbol, q]));
  const selectedItem = (watchlist.data || []).find((w) => w.symbol === selectedSymbol);

  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function removeItem(item: WatchlistItem) {
    if (useGuest) {
      removeGuestSymbol(item.id);
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    } else {
      removeMutation.mutate(item.id);
    }
    if (selectedSymbol === item.symbol) onSelect("");
  }

  return (
    <div className="pane-left">
      <div className="pane-header">
        <h2>Watchlist</h2>
        {selectedItem && (
          <button
            type="button"
            className="btn btn-ghost pane-header-action"
            onClick={() => removeItem(selectedItem)}
          >
            Remove {selectedItem.symbol}
          </button>
        )}
      </div>

      {AUTH_ENABLED && !sessionPending && !isAuthed && (
        <div className="guest-banner">
          <span>Browsing as guest. Sign in to save your list across devices.</span>
          <Link to="/login" search={{ next: "/" }} className="btn btn-primary">
            Sign in to save
          </Link>
        </div>
      )}

      {watchlist.isError && !useGuest && (
        <div className="error-banner">{(watchlist.error as Error).message}</div>
      )}

      {watchlist.isLoading || (AUTH_ENABLED && sessionPending) ? (
        <div className="empty-state">Loading watchlist…</div>
      ) : !watchlist.data?.length ? (
        <div className="empty-state">
          <strong>No stocks yet</strong>
          <span>Add a big-cap ticker to start tracking dips and alerts.</span>
        </div>
      ) : (
        <ul className="stock-list">
          {watchlist.data.map((item) => (
            <li key={item.id}>
              <StockRow
                item={item}
                quote={quoteMap.get(item.symbol)}
                active={selectedSymbol === item.symbol}
                onSelect={() => onSelect(item.symbol)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StockRow({
  item,
  quote,
  active,
  onSelect,
}: {
  item: WatchlistItem;
  quote?: Quote;
  active: boolean;
  onSelect: () => void;
}) {
  const pct = quote?.changePercent;
  const pctClass = pct == null ? "" : pct >= 0 ? "pct-up" : "pct-down";

  return (
    <div className={`stock-row ${active ? "active" : ""}`}>
      <button type="button" className="stock-item" onClick={onSelect}>
        <div>
          <div className="stock-symbol">{item.symbol}</div>
          <div className="stock-name">{item.displayName || quote?.shortName || "—"}</div>
        </div>
        <div className="stock-price">
          <div className="tabular">
            {quote?.price != null ? quote.price.toFixed(2) : "—"}
          </div>
          <div className={`tabular ${pctClass}`}>
            {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
          </div>
        </div>
      </button>
    </div>
  );
}
