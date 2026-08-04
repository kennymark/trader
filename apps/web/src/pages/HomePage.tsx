import { useState } from "react";
import { ChartPane } from "../components/ChartPane";
import { WatchlistPane } from "../components/WatchlistPane";

export function HomePage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="two-pane">
      <WatchlistPane
        selectedSymbol={selected}
        onSelect={(s) => setSelected(s || null)}
      />
      <ChartPane symbol={selected} />
    </div>
  );
}
