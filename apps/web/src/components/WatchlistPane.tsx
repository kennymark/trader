import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Quote, WatchlistItem } from "@trader/shared";
import { addWatchlist, fetchQuotes, fetchWatchlist, removeWatchlist } from "../lib/queries";

type Props = {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
};

export function WatchlistPane({ selectedSymbol, onSelect }: Props) {
  const [symbol, setSymbol] = useState("");
  const qc = useQueryClient();

  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
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

  return (
    <div className="pane-left">
      <div className="pane-header">
        <h2>Watchlist</h2>
      </div>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!symbol.trim()) return;
          addMutation.mutate(symbol.trim());
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Add symbol (e.g. AAPL)"
          aria-label="Stock symbol"
        />
        <button className="btn btn-primary" type="submit" disabled={addMutation.isPending}>
          Add
        </button>
      </form>

      {addMutation.isError && (
        <div className="error-banner">{(addMutation.error as Error).message}</div>
      )}
      {watchlist.isError && (
        <div className="error-banner">{(watchlist.error as Error).message}</div>
      )}

      {watchlist.isLoading ? (
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
                onRemove={() => {
                  removeMutation.mutate(item.id);
                  if (selectedSymbol === item.symbol) onSelect("");
                }}
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
