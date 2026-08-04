import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Quote, WatchlistItem } from "@trader/shared";
import { authClient } from "../lib/auth";
import {
  addGuestSymbol,
  getGuestWatchlist,
  removeGuestSymbol,
} from "../lib/guestWatchlist";
import { addWatchlist, fetchQuotes, fetchWatchlist, removeWatchlist } from "../lib/queries";

type Props = {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
};

export function WatchlistPane({ selectedSymbol, onSelect }: Props) {
  const [symbol, setSymbol] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestTick, setGuestTick] = useState(0);
  const qc = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = Boolean(session?.user);

  const watchlist = useQuery({
    queryKey: ["watchlist", isAuthed ? "server" : "guest", guestTick],
    queryFn: async () => {
      if (isAuthed) return fetchWatchlist();
      return getGuestWatchlist();
    },
    enabled: !sessionPending,
  });

  const symbols = (watchlist.data || []).map((w) => w.symbol);

  const quotes = useQuery({
    queryKey: ["quotes", symbols.join(",")],
    queryFn: () => fetchQuotes(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const quoteMap = new Map((quotes.data || []).map((q) => [q.symbol, q]));

  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      setSymbol("");
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

    if (isAuthed) {
      addMutation.mutate(next);
      return;
    }

    try {
      const item = addGuestSymbol(next);
      setGuestTick((t) => t + 1);
      setSymbol("");
      onSelect(item.symbol);
    } catch (err) {
      setGuestError((err as Error).message);
    }
  }

  function removeItem(item: WatchlistItem) {
    if (isAuthed) {
      removeMutation.mutate(item.id);
    } else {
      removeGuestSymbol(item.id);
      setGuestTick((t) => t + 1);
    }
    if (selectedSymbol === item.symbol) onSelect("");
  }

  return (
    <div className="pane-left">
      <div className="pane-header">
        <h2>Watchlist</h2>
      </div>

      {!sessionPending && !isAuthed && (
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
          addSymbol(symbol);
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Add symbol (e.g. AAPL)"
          aria-label="Stock symbol"
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={addMutation.isPending || sessionPending}
        >
          Add
        </button>
      </form>

      {(addMutation.isError || guestError) && (
        <div className="error-banner">
          {guestError || (addMutation.error as Error).message}
        </div>
      )}
      {watchlist.isError && isAuthed && (
        <div className="error-banner">{(watchlist.error as Error).message}</div>
      )}

      {watchlist.isLoading || sessionPending ? (
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
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <button
        type="button"
        className={`stock-item ${active ? "active" : ""}`}
        onClick={onSelect}
        style={{ flex: 1 }}
      >
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
        className="btn btn-ghost btn-danger"
        aria-label={`Remove ${item.symbol}`}
        onClick={onRemove}
        style={{ marginRight: "0.5rem", alignSelf: "center" }}
      >
        ×
      </button>
    </div>
  );
}
