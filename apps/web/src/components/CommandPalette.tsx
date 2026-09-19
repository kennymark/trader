import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { SymbolSearchResult } from "@trader/shared";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { searchSymbols } from "../lib/queries";
import { writeSelectedSymbol } from "../lib/selectedSymbol";
import { useWatchlist } from "../lib/watchlistActions";

/**
 * One way into everything, on ⌘K. The app has five surfaces of equal standing
 * and a watchlist that grows past what a sidebar can show, so the fastest route
 * to a stock should not depend on which page you happen to be on.
 *
 * It is a statement sheet like every other surface: ruled sections, no icons,
 * and the active row inked in rather than tinted.
 */

type Command = {
  id: string;
  /** Section heading this row files under. */
  group: string;
  label: string;
  /** Right-flushed reference text: a company name, an exchange, a verb. */
  hint?: string;
  /** Extra text that should match a query without being displayed. */
  keywords?: string;
  run: () => void;
};

const NAV: Array<{ to: "/" | "/calendar" | "/portfolio" | "/settings"; label: string; keywords: string }> = [
  { to: "/", label: "Watchlist", keywords: "stocks home hunt quotes" },
  { to: "/calendar", label: "Calendar", keywords: "events earnings diary dates" },
  { to: "/portfolio", label: "Portfolio", keywords: "positions p&l pnl holdings trades" },
  { to: "/settings", label: "Settings", keywords: "alerts channels import csv delivery account" },
];

/** Prefix matches rank above contained matches; everything else is dropped. */
function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const at = h.indexOf(n);
  if (at < 0) return -1;
  return at === 0 ? 2 : 1;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const { items, add } = useWatchlist();
  const { data: session } = authClient.useSession();
  const deferredQuery = useDeferredValue(query.trim());

  // ⌘K from anywhere, including from inside the topbar search. Ctrl+K covers
  // the same gesture off the Mac. preventDefault stops Firefox and Safari
  // taking it for their own address-bar search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The page behind must not scroll under the sheet, and the control that had
  // focus should get it back, so ⌘K twice leaves you exactly where you were.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  /**
   * Only search the market once the local list has been given a chance to
   * answer: most opens are a jump to a stock already on the watchlist, and that
   * needs no round trip.
   */
  const remote = useQuery({
    queryKey: ["symbol-search", deferredQuery],
    queryFn: () => searchSymbols(deferredQuery),
    enabled: open && deferredQuery.length >= 1,
    staleTime: 60_000,
  });

  function openSymbol(symbol: string) {
    writeSelectedSymbol(symbol);
    navigate({ to: "/" });
    close();
  }

  const commands = useMemo<Command[]>(() => {
    const watched = new Set(items.map((i) => i.symbol.toUpperCase()));

    const list: Command[] = [];

    for (const item of NAV) {
      list.push({
        id: `nav:${item.to}`,
        group: "Go to",
        label: item.label,
        keywords: item.keywords,
        run: () => {
          navigate({ to: item.to });
          close();
        },
      });
    }

    for (const item of items) {
      list.push({
        id: `watch:${item.symbol}`,
        group: "On your watchlist",
        label: item.symbol,
        hint: item.displayName ?? undefined,
        keywords: item.displayName ?? "",
        run: () => openSymbol(item.symbol),
      });
    }

    // Anything the market knows that you are not already watching. Choosing it
    // adds it and opens it, which is what the topbar search does too.
    for (const result of (remote.data ?? []) as SymbolSearchResult[]) {
      if (watched.has(result.symbol.toUpperCase())) continue;
      list.push({
        id: `add:${result.symbol}`,
        group: "Add a stock",
        label: result.symbol,
        hint: result.name,
        keywords: [result.name, result.exchange, result.type].filter(Boolean).join(" "),
        run: () => {
          add.mutate(
            { symbol: result.symbol, displayName: result.name },
            { onSuccess: () => openSymbol(result.symbol) },
          );
          close();
        },
      });
    }

    if (AUTH_ENABLED && session?.user) {
      list.push({
        id: "action:signout",
        group: "Account",
        label: "Sign out",
        hint: session.user.email,
        run: () => {
          void authClient.signOut();
          close();
        },
      });
    }

    return list;
    // `add` and `navigate` are stable enough for this to rebuild only on data.
  }, [items, remote.data, session?.user, navigate]);

  const results = useMemo(() => {
    if (!deferredQuery) {
      // Nothing typed: offer the places, then the list, unranked.
      return commands.filter((c) => c.group !== "Add a stock");
    }
    return commands
      .map((command) => ({
        command,
        rank: Math.max(
          score(command.label, deferredQuery),
          score(command.hint ?? "", deferredQuery),
          score(command.keywords ?? "", deferredQuery),
        ),
      }))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .map((r) => r.command);
  }, [commands, deferredQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, results.length]);

  // Keep the inked-in row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[activeIndex]?.run();
    }
  }

  let lastGroup: string | null = null;

  return (
    <div className="cmdk-root" role="presentation">
      <button type="button" className="cmdk-backdrop" aria-label="Close command palette" onClick={close} />

      <div className="cmdk-sheet" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Go to a page, or search a stock"
          aria-label="Command or stock"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="cmdk-results" ref={listRef} role="listbox" aria-label="Results">
          {results.length === 0 && (
            <p className="cmdk-empty">
              {remote.isFetching ? "Searching…" : `Nothing matches “${deferredQuery}”.`}
            </p>
          )}

          {results.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const active = index === activeIndex;
            return (
              <div key={command.id}>
                {heading && <p className="cmdk-group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  className="cmdk-row"
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => command.run()}
                >
                  <span className="cmdk-row-label">{command.label}</span>
                  {command.hint && <span className="cmdk-row-hint">{command.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <p className="cmdk-foot">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </p>
      </div>
    </div>
  );
}
