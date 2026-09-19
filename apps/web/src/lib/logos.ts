/**
 * Company marks come from whichever logo service the deployment is pointed at,
 * because no free provider covers this portfolio: the services are built around
 * US tickers, and a Freetrade account holds LSE lines (`.L`), ETFs and
 * investment trusts that most of them have never heard of.
 *
 * So the URL is configuration, not a hard-coded vendor. Set VITE_LOGO_URL to a
 * template containing `{ticker}` (the symbol as held, e.g. VOD.L) and/or
 * `{base}` (the part before the exchange suffix, e.g. VOD):
 *
 *   VITE_LOGO_URL=https://example-logo-cdn.com/ticker/{base}?token=pk_live_xxx
 *
 * Unset, every stock falls back to its monogram and nothing looks broken.
 */
const TEMPLATE = (import.meta.env.VITE_LOGO_URL as string | undefined)?.trim();

export const LOGOS_CONFIGURED = Boolean(TEMPLATE);

/** `VOD.L` → `VOD`. Providers key off the company, not the listing venue. */
export function baseTicker(symbol: string): string {
  return symbol.trim().toUpperCase().split(".")[0] || symbol.trim().toUpperCase();
}

export function logoUrlFor(symbol: string): string | null {
  const ticker = symbol.trim().toUpperCase();
  if (!TEMPLATE || !ticker) return null;
  return TEMPLATE.replaceAll("{ticker}", encodeURIComponent(ticker)).replaceAll(
    "{base}",
    encodeURIComponent(baseTicker(ticker)),
  );
}

/**
 * Two letters is enough to tell BRK.B from BP at a glance, and it is what the
 * row falls back to whenever a logo is missing, blocked, or slow.
 */
export function monogram(symbol: string): string {
  return baseTicker(symbol).slice(0, 2);
}
