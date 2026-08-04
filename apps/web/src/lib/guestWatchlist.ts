import type { WatchlistItem } from "@trader/shared";

const KEY = "trader:guest-watchlist";

type GuestItem = {
  symbol: string;
  displayName: string | null;
};

function readRaw(): GuestItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuestItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: GuestItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getGuestWatchlist(): WatchlistItem[] {
  return readRaw().map((item, i) => ({
    id: `guest:${item.symbol}`,
    symbol: item.symbol,
    displayName: item.displayName,
    sortOrder: i,
    createdAt: new Date(0).toISOString(),
  }));
}

export function addGuestSymbol(symbol: string, displayName: string | null = null): WatchlistItem {
  const upper = symbol.trim().toUpperCase();
  const items = readRaw();
  if (items.some((i) => i.symbol === upper)) {
    throw new Error("Symbol already on watchlist");
  }
  items.push({ symbol: upper, displayName });
  writeRaw(items);
  return {
    id: `guest:${upper}`,
    symbol: upper,
    displayName,
    sortOrder: items.length - 1,
    createdAt: new Date().toISOString(),
  };
}

export function removeGuestSymbol(idOrSymbol: string) {
  const symbol = idOrSymbol.replace(/^guest:/, "").toUpperCase();
  writeRaw(readRaw().filter((i) => i.symbol !== symbol));
}

export function getGuestSymbols(): string[] {
  return readRaw().map((i) => i.symbol);
}

export function clearGuestWatchlist() {
  localStorage.removeItem(KEY);
}
