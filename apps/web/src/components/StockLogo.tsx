import { useEffect, useState } from "react";
import { logoUrlFor, monogram } from "../lib/logos";

type Props = {
  symbol: string;
  /** `list` for a watchlist row, `table` for a ledger cell. */
  size?: "list" | "table";
};

/**
 * The company's own mark, with the ticker's monogram behind it.
 *
 * Coverage is the whole problem: any logo service will miss a slice of a UK
 * portfolio, and a row that renders a broken image is worse than one that never
 * promised a logo. So the monogram is not an error state — it is the default,
 * and the logo paints over it only once it has actually loaded.
 */
export function StockLogo({ symbol, size = "list" }: Props) {
  const src = logoUrlFor(symbol);
  const [failed, setFailed] = useState(false);

  // A row can be recycled onto a different stock as the list re-sorts, and a
  // previous failure must not condemn the new symbol to its monogram.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className={`stock-logo stock-logo-${size}`} aria-hidden="true">
      <span className="stock-logo-mono">{monogram(symbol)}</span>
      {src && !failed && (
        <img
          className="stock-logo-img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
