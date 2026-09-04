const SELECTED_KEY = "trader:selected-symbol";
const CHANGED = "trader:selected-symbol-changed";

export function readSelectedSymbol(): string | null {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    const symbol = raw?.trim().toUpperCase();
    return symbol || null;
  } catch {
    return null;
  }
}

export function writeSelectedSymbol(symbol: string | null) {
  try {
    if (symbol) localStorage.setItem(SELECTED_KEY, symbol);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // ignore quota / private-mode failures
  }
  // The search now lives in the navbar, so the page showing the chart has to
  // hear about a selection made outside it.
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: symbol }));
}

export function subscribeSelectedSymbol(fn: (symbol: string | null) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<string | null>).detail ?? null);
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}
