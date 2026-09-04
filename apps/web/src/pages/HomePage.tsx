import { useCallback, useState } from "react";
import { ChartPane } from "../components/ChartPane";
import { WatchlistPane } from "../components/WatchlistPane";
import { readSelectedSymbol, writeSelectedSymbol } from "../lib/selectedSymbol";

export function HomePage() {
  const [selected, setSelected] = useState<string | null>(() => readSelectedSymbol());

  function handleSelect(symbol: string) {
    const next = symbol || null;
    setSelected(next);
    writeSelectedSymbol(next);
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
      <ChartPane symbol={selected} />
    </div>
  );
}
