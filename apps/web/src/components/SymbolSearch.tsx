import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import type { SymbolSearchResult } from "@trader/shared";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { addGuestSymbol } from "../lib/guestWatchlist";
import { addWatchlist, searchSymbols } from "../lib/queries";
import { writeSelectedSymbol } from "../lib/selectedSymbol";

/**
 * The one search in the app, in the navbar. Adding a symbol from any surface
 * puts it on the watchlist and opens it, so the search is a way into a stock
 * rather than a control that only works on one page.
 */
export function SymbolSearch() {
  const [symbol, setSymbol] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [guestError, setGuestError] = useState<string | null>(null);
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const deferredQuery = useDeferredValue(symbol.trim());
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const useGuest = AUTH_ENABLED && !session?.user;

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

  function opened(ticker: string) {
    setSymbol("");
    setOpen(false);
    setGuestError(null);
    writeSelectedSymbol(ticker);
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    navigate({ to: "/" });
  }

  const addMutation = useMutation({
    mutationFn: (symbol: string) => addWatchlist(symbol),
    onSuccess: (item) => opened(item.symbol),
  });

  function addSymbol(raw: string) {
    const next = raw.trim().toUpperCase();
    if (!next) return;
    setGuestError(null);

    if (useGuest) {
      try {
        opened(addGuestSymbol(next).symbol);
      } catch (err) {
        setGuestError((err as Error).message);
      }
      return;
    }
    addMutation.mutate(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      addSymbol(results[activeIndex]!.symbol);
    }
  }

  const showSuggestions = open && deferredQuery.length >= 1;
  const error = guestError || (addMutation.isError ? (addMutation.error as Error).message : null);

  return (
    <form
      className="navsearch"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (showSuggestions && results[activeIndex]) {
          addSymbol(results[activeIndex]!.symbol);
          return;
        }
        addSymbol(symbol);
      }}
    >
      <div className="navsearch-field" ref={wrapRef}>
        <input
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a stock to add and open"
          aria-label="Search stocks"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          role="combobox"
          autoComplete="off"
          disabled={AUTH_ENABLED && sessionPending}
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
            {results.map((item: SymbolSearchResult, index: number) => (
              <li key={item.symbol} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`symbol-suggestion ${index === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => addSymbol(item.symbol)}
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
      {error && <p className="navsearch-error">{error}</p>}
    </form>
  );
}
