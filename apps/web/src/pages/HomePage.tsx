import { useCallback, useEffect, useState } from "react";
import { ChartPane } from "../components/ChartPane";
import { WatchlistPane } from "../components/WatchlistPane";
import { SymbolIntelligence } from "../components/SymbolIntelligence";
import { usePreferences } from "../lib/preferences";
import {
  readSelectedSymbol,
  subscribeSelectedSymbol,
  writeSelectedSymbol,
} from "../lib/selectedSymbol";

import type { WorkTab as Tab } from "@trader/shared";

const TABS: Array<[Tab, string]> = [
  ["chart", "Chart"],
  ["intelligence", "Intelligence"],
];

/**
 * The watchlist and the hunt are one surface. Scoring is a property of a row
 * rather than a separate place you visit. The calendar left for its own route:
 * dated events are a diary of the whole list, not a view of the selected name.
 */
export function HomePage() {
  const { prefs, loaded } = usePreferences();
  const [selected, setSelected] = useState<string | null>(() => readSelectedSymbol());
  const [tab, setTab] = useState<Tab>(prefs.defaultWorkTab);
  const [touched, setTouched] = useState(false);

  // Same as the chart range: honour the stored tab until the reader picks one.
  useEffect(() => {
    if (loaded && !touched) setTab(prefs.defaultWorkTab);
  }, [loaded, prefs.defaultWorkTab, touched]);

  // The navbar search selects a symbol from outside this page.
  useEffect(() => subscribeSelectedSymbol((next) => setSelected(next)), []);

  function handleSelect(symbol: string) {
    const next = symbol || null;
    setSelected(next);
    writeSelectedSymbol(next);
    if (next) setTab((t) => (t === "chart" || t === "intelligence" ? t : "chart"));
  }

  /**
   * Open the first symbol once the list arrives. The chart pane is the largest
   * region on the page, so leaving it on an empty state wastes most of the screen.
   */
  const handleSymbolsLoaded = useCallback((symbols: string[]) => {
    setSelected((current) => {
      if (current && symbols.includes(current)) return current;
      const next = symbols[0] ?? null;
      writeSelectedSymbol(next);
      return next;
    });
  }, []);

  return (
    <div className="two-pane">
      <WatchlistPane
        selectedSymbol={selected}
        onSelect={handleSelect}
        onSymbolsLoaded={handleSymbolsLoaded}
      />

      <div className="work-pane">
        <div className="work-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTouched(true);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "chart" && <ChartPane symbol={selected} />}

        {tab === "intelligence" &&
          (selected ? (
            <div className="work-scroll">
              <SymbolIntelligence symbol={selected} />
            </div>
          ) : (
            <p className="work-empty">Pick a stock to read its intelligence.</p>
          ))}

      </div>
    </div>
  );
}
