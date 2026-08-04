const SELECTED_KEY = "trader:selected-symbol";

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
}
