import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import type { Quote, SymbolSearchResult, WatchlistItem } from "@trader/shared";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import {
  addGuestSymbol,
  getGuestWatchlist,
  removeGuestSymbol,
} from "../lib/guestWatchlist";
import {
  addWatchlist,
  fetchQuotes,
  fetchWatchlist,
  removeWatchlist,
  searchSymbols,
} from "../lib/queries";

type Props = {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
};

export function WatchlistPane({ selectedSymbol, onSelect }: Props) {
  const [symbol, setSymbol] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestTick, setGuestTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const deferredQuery = useDeferredValue(symbol.trim());
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);
  const useGuest = AUTH_ENABLED && !session?.user;

  const watchlist = useQuery({
    queryKey: ["watchlist", useGuest ? "guest" : "server", guestTick],
    queryFn: async () => {
      if (useGuest) return getGuestWatchlist();
      return fetchWatchlist();
    },
    enabled: !AUTH_ENABLED || !sessionPending,
  });

  const symbols = (watchlist.data || []).map((w) => w.symbol);

  const quotes = useQuery({
    queryKey: ["quotes", symbols.join(",")],
    queryFn: () => fetchQuotes(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const suggestions = useQuery({
    queryKey: ["symbol-search", deferredQuery],
    queryFn: () => searchSymbols(deferredQuery),
    enabled: deferredQuery.length >= 1,
    staleTime: 60_000,
  });

  const results = suggestions.data || [];

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, results.length]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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

  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      setSymbol("");
      setOpen(false);
      onSelect(item.symbol);
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function addSymbol(raw: string) {
    const next = raw.trim().toUpperCase();
    if (!next) return;
    setGuestError(null);

    if (useGuest) {
      try {
        const item = addGuestSymbol(next);
        setGuestTick((t) => t + 1);
        setSymbol("");
        setOpen(false);
        onSelect(item.symbol);
      } catch (err) {
        setGuestError((err as Error).message);
      }
      return;
    }

    addMutation.mutate(next);
  }

  function pickSuggestion(item: SymbolSearchResult) {
    addSymbol(item.symbol);
  }

  function removeItem(item: WatchlistItem) {
    if (useGuest) {
      removeGuestSymbol(item.id);
      setGuestTick((t) => t + 1);
    } else {
      removeMutation.mutate(item.id);
    }
    if (selectedSymbol === item.symbol) onSelect("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      pickSuggestion(results[activeIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showSuggestions = open && deferredQuery.length >= 1;

  return (
    <div className="pane-left">
      <div className="pane-header">
        <h2>Watchlist</h2>
      </div>

      {AUTH_ENABLED && !sessionPending && !isAuthed && (
        <div className="guest-banner">
          <span>Browsing as guest. Sign in to save your list across devices.</span>
          <Link to="/login" search={{ next: "/" }} className="btn btn-primary">
            Sign in to save
          </Link>
        </div>
      )}

      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (showSuggestions && results[activeIndex]) {
            pickSuggestion(results[activeIndex]!);
            return;
          }
          addSymbol(symbol);
        }}
      >
        <div className="symbol-search" ref={wrapRef}>
          <input
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search stocks (e.g. AAPL)"
            aria-label="Stock symbol"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={listboxId}
            role="combobox"
            autoComplete="off"
          />
          {showSuggestions && (
            <ul className="symbol-suggestions" id={listboxId} role="listbox">
              {suggestions.isFetching && results.length === 0 && (
                <li className="symbol-suggestion muted">Searching…</li>
              )}
              {suggestions.isError && (
                <li className="symbol-suggestion muted">Couldn’t search symbols</li>
              )}
              {!suggestions.isFetching && !suggestions.isError && results.length === 0 && (
                <li className="symbol-suggestion muted">No matches</li>
              )}
              {results.map((item, index) => (
                <li key={item.symbol} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={`symbol-suggestion ${index === activeIndex ? "active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pickSuggestion(item)}
                  >
                    <span className="symbol-suggestion-ticker">{item.symbol}</span>
                    <span className="symbol-suggestion-meta">
                      <span className="symbol-suggestion-name">{item.name}</span>
                      {(item.exchange || item.type) && (
                        <span className="symbol-suggestion-exch">
                          {[item.exchange, item.type].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={addMutation.isPending || (AUTH_ENABLED && sessionPending)}
        >
          Add
        </button>
      </form>

      {(addMutation.isError || guestError) && (
        <div className="error-banner">
          {guestError || (addMutation.error as Error).message}
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
                onRemove={() => removeItem(item)}
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
  onRemove,
}: {
  item: WatchlistItem;
  quote?: Quote;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
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
          <div>{quote?.price != null ? quote.price.toFixed(2) : "—"}</div>
          <div className={pctClass}>
            {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
          </div>
        </div>
      </button>
      <button
        type="button"
        className="stock-remove"
        aria-label={`Remove ${item.symbol}`}
        onClick={onRemove}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
