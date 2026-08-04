import { useState } from "react";
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

  return (
    <div className="two-pane">
      <WatchlistPane
        selectedSymbol={selected}
        onSelect={handleSelect}
      />
      <ChartPane symbol={selected} />
    </div>
  );
}
