import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ChartPane } from "../components/ChartPane";
import { WatchlistPane } from "../components/WatchlistPane";
import { SymbolIntelligence } from "../components/SymbolIntelligence";
import {
  CatalystCalendar,
  FeedList,
  PredictionsPanel,
} from "./IntelligencePage";
import { fetchIntelligence, fetchPredictions } from "../lib/queries";
import {
  readSelectedSymbol,
  subscribeSelectedSymbol,
  writeSelectedSymbol,
} from "../lib/selectedSymbol";

type Tab = "chart" | "intelligence" | "feed" | "calendar" | "record";

const TABS: Array<[Tab, string]> = [
  ["chart", "Chart"],
  ["intelligence", "Intelligence"],
  ["feed", "Feed"],
  ["calendar", "Calendar"],
  ["record", "Track record"],
];

/**
 * The watchlist and the hunt are one surface. Scoring is a property of a row
 * rather than a separate place you visit, and the hunt's list-wide views sit
 * beside the chart instead of on their own page.
 */
export function HomePage() {
  const [selected, setSelected] = useState<string | null>(() => readSelectedSymbol());
  const [tab, setTab] = useState<Tab>("chart");

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

  const hunt = useQuery({
    queryKey: ["intelligence", "watchlist"],
    queryFn: () => fetchIntelligence(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const predictions = useQuery({
    queryKey: ["predictions"],
    queryFn: fetchPredictions,
    enabled: tab === "record",
    staleTime: 60_000,
    retry: false,
  });

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
              onClick={() => setTab(id)}
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

        {tab === "feed" && (
          <div className="work-scroll">
            {hunt.isPending && <p className="work-empty">Scoring your list…</p>}
            {hunt.isError && <p className="work-empty">Couldn’t load the feed.</p>}
            {hunt.data && <FeedList items={hunt.data.feed} />}
          </div>
        )}

        {tab === "calendar" && (
          <div className="work-scroll">
            {hunt.isPending && <p className="work-empty">Scoring your list…</p>}
            {hunt.isError && <p className="work-empty">Couldn’t load the calendar.</p>}
            {hunt.data && <CatalystCalendar items={hunt.data.catalysts} />}
          </div>
        )}

        {tab === "record" && (
          <div className="work-scroll">
            {predictions.isPending && <p className="work-empty">Loading the record…</p>}
            {predictions.isError && <p className="work-empty">Couldn’t load the record.</p>}
            {predictions.data && (
              <PredictionsPanel
                data={predictions.data}
                onRefreshHunt={() => hunt.refetch()}
                refreshing={hunt.isFetching}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
