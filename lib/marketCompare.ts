import type { HistoryBar } from "@trader/shared";
import type { ParsedFreetradeTx } from "./freetrade";
import { getHistory } from "./yahoo";

export type YearReturnRow = {
  year: number;
  youPct: number | null;
  youPnl: number;
  youCapital: number;
  sp500Pct: number | null;
  ftse100Pct: number | null;
  vsSp500Pct: number | null;
  vsFtse100Pct: number | null;
  partial: boolean;
};

export type MarketCompareResult = {
  currency: string;
  firstInvestedAt: string;
  asOf: string;
  note: string;
  overall: {
    youPct: number | null;
    youPnl: number;
    youCapital: number;
    sp500Pct: number | null;
    ftse100Pct: number | null;
    years: number;
  };
  years: YearReturnRow[];
  benchmarks: Array<{ id: "sp500" | "ftse100"; label: string; symbol: string }>;
};

const BENCHMARKS = [
  { id: "sp500" as const, label: "S&P 500", symbol: "^GSPC" },
  { id: "ftse100" as const, label: "FTSE 100", symbol: "^FTSE" },
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function yearOf(d: Date) {
  return d.getUTCFullYear();
}

function groupKey(tx: ParsedFreetradeTx): string | null {
  if (tx.isin && tx.isin.trim()) return tx.isin.trim();
  if (tx.symbol) return tx.symbol;
  return null;
}

function inferSplit(held: number, sellQty: number): number | null {
  if (held <= 1e-8 || sellQty <= held * 1.25) return null;
  const r = sellQty / held;
  const nearest = Math.round(r);
  if (nearest >= 3 && Math.abs(r - nearest) / nearest <= 0.03) return nearest;
  return null;
}

/**
 * Yearly return ≈ (realized P&L + dividends) / average cost basis for that year.
 * Not a true time-weighted mark-to-market return — Freetrade exports don't give daily NAV.
 */
export function computeYearlyPortfolioReturns(
  txs: ParsedFreetradeTx[],
  now = new Date(),
): {
  firstInvestedAt: Date | null;
  years: Array<{
    year: number;
    pnl: number;
    capital: number;
    returnPct: number | null;
    partial: boolean;
  }>;
  overall: { pnl: number; capital: number; returnPct: number | null; years: number };
} {
  type Pos = { quantity: number; costBasis: number };
  const positions = new Map<string, Pos>();

  const chronological = [...txs].sort(
    (a, b) => (a.tradedAt?.getTime() ?? 0) - (b.tradedAt?.getTime() ?? 0),
  );

  let firstInvestedAt: Date | null = null;
  let totalInvested = 0;
  let totalPnl = 0;

  type YearAcc = { pnl: number; capitalPoints: number[] };
  const byYear = new Map<number, YearAcc>();

  function totalCostBasis() {
    let s = 0;
    for (const p of positions.values()) s += p.costBasis;
    return s;
  }

  function touchYear(y: number) {
    let row = byYear.get(y);
    if (!row) {
      row = { pnl: 0, capitalPoints: [] };
      byYear.set(y, row);
    }
    row.capitalPoints.push(totalCostBasis());
    return row;
  }

  for (const tx of chronological) {
    if (!tx.tradedAt) continue;
    const y = yearOf(tx.tradedAt);
    const type = tx.type.trim().toUpperCase();

    if (type === "DIVIDEND" || type.includes("DIVIDEND")) {
      const amt = tx.totalAmount ?? 0;
      const row = touchYear(y);
      row.pnl += amt;
      totalPnl += amt;
      continue;
    }

    if (type.includes("SPLIT")) {
      const key = groupKey(tx);
      if (!key) continue;
      const acc = positions.get(key);
      if (!acc) continue;
      const from = Number(tx.raw["stock split rate of share outturn from"] || "");
      const to = Number(tx.raw["stock split rate of share outturn to"] || "");
      if (from > 0 && to > 0) acc.quantity *= to / from;
      touchYear(y);
      continue;
    }

    if (!tx.side || tx.quantity == null || tx.quantity <= 0) continue;
    const key = groupKey(tx);
    if (!key) continue;

    if (tx.side === "buy") {
      const spend =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * tx.quantity
            : 0;
      if (!firstInvestedAt) firstInvestedAt = tx.tradedAt;
      let acc = positions.get(key);
      if (!acc) {
        acc = { quantity: 0, costBasis: 0 };
        positions.set(key, acc);
      }
      acc.costBasis += spend;
      acc.quantity += tx.quantity;
      totalInvested += spend;
      touchYear(y);
    } else {
      const proceeds =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * tx.quantity
            : 0;
      let acc = positions.get(key);
      let realized = proceeds;
      if (acc && acc.quantity > 1e-12) {
        const ratio = inferSplit(acc.quantity, tx.quantity);
        if (ratio) acc.quantity *= ratio;
        const sellQty = Math.min(tx.quantity, acc.quantity);
        const avg = acc.costBasis / acc.quantity;
        const matched = tx.quantity > 0 ? proceeds * (sellQty / tx.quantity) : 0;
        realized = matched - avg * sellQty;
        acc.costBasis = Math.max(0, acc.costBasis - avg * sellQty);
        acc.quantity -= sellQty;
        if (acc.quantity <= 1e-8) {
          acc.quantity = 0;
          acc.costBasis = 0;
        }
      }
      const row = touchYear(y);
      row.pnl += realized;
      totalPnl += realized;
    }
  }

  if (!firstInvestedAt) {
    return {
      firstInvestedAt: null,
      years: [],
      overall: { pnl: 0, capital: 0, returnPct: null, years: 0 },
    };
  }

  const startY = yearOf(firstInvestedAt);
  const endY = yearOf(now);
  const years = [];
  for (let y = startY; y <= endY; y++) {
    const row = byYear.get(y) ?? { pnl: 0, capitalPoints: [0] };
    const points = row.capitalPoints.length ? row.capitalPoints : [0];
    const capital = points.reduce((s, n) => s + n, 0) / points.length;
    const returnPct =
      capital > 1 ? round1((row.pnl / capital) * 100) : row.pnl === 0 ? 0 : null;
    years.push({
      year: y,
      pnl: round2(row.pnl),
      capital: round2(Math.max(capital, 0)),
      returnPct,
      partial: y === startY || y === endY,
    });
  }

  return {
    firstInvestedAt,
    years,
    overall: {
      pnl: round2(totalPnl),
      capital: round2(totalInvested),
      returnPct: totalInvested > 0 ? round1((totalPnl / totalInvested) * 100) : null,
      years: years.length,
    },
  };
}

/** Calendar-year price returns from daily bars. */
export function indexYearlyReturns(
  bars: HistoryBar[],
  fromYear: number,
  toYear: number,
): Map<number, number> {
  const byYear = new Map<number, { first: number; last: number }>();
  for (const b of bars) {
    const d = new Date(b.time * 1000);
    const y = d.getUTCFullYear();
    if (y < fromYear || y > toYear) continue;
    const row = byYear.get(y);
    if (!row) byYear.set(y, { first: b.close, last: b.close });
    else row.last = b.close;
  }
  const out = new Map<number, number>();
  for (const [y, { first, last }] of byYear) {
    if (first > 0) out.set(y, round1(((last - first) / first) * 100));
  }
  return out;
}

export function indexPeriodReturn(bars: HistoryBar[], from: Date, to: Date): number | null {
  const fromTs = from.getTime() / 1000;
  const toTs = to.getTime() / 1000;
  let first: number | null = null;
  let last: number | null = null;
  for (const b of bars) {
    if (b.time < fromTs) continue;
    if (b.time > toTs) break;
    if (first == null) first = b.close;
    last = b.close;
  }
  if (first == null || last == null || first <= 0) return null;
  return round1(((last - first) / first) * 100);
}

export async function buildMarketCompare(
  txs: ParsedFreetradeTx[],
  now = new Date(),
): Promise<MarketCompareResult | null> {
  const portfolio = computeYearlyPortfolioReturns(txs, now);
  if (!portfolio.firstInvestedAt || portfolio.years.length === 0) return null;

  const fromYear = portfolio.years[0]!.year;
  const toYear = portfolio.years[portfolio.years.length - 1]!.year;

  const histories = await Promise.all(
    BENCHMARKS.map(async (b) => {
      try {
        const bars = await getHistory(b.symbol, "max");
        return { id: b.id, bars };
      } catch (err) {
        console.error(`Failed fetching ${b.symbol}`, err);
        return { id: b.id, bars: [] as HistoryBar[] };
      }
    }),
  );

  const spBars = histories.find((h) => h.id === "sp500")?.bars ?? [];
  const ftBars = histories.find((h) => h.id === "ftse100")?.bars ?? [];
  const spYears = indexYearlyReturns(spBars, fromYear, toYear);
  const ftYears = indexYearlyReturns(ftBars, fromYear, toYear);

  const years: YearReturnRow[] = portfolio.years.map((y) => {
    const sp = spYears.get(y.year) ?? null;
    const ft = ftYears.get(y.year) ?? null;
    return {
      year: y.year,
      youPct: y.returnPct,
      youPnl: y.pnl,
      youCapital: y.capital,
      sp500Pct: sp,
      ftse100Pct: ft,
      vsSp500Pct: y.returnPct != null && sp != null ? round1(y.returnPct - sp) : null,
      vsFtse100Pct: y.returnPct != null && ft != null ? round1(y.returnPct - ft) : null,
      partial: y.partial,
    };
  });

  return {
    currency: "GBP",
    firstInvestedAt: portfolio.firstInvestedAt.toISOString(),
    asOf: now.toISOString(),
    note:
      "Your yearly % is realized P&L + dividends ÷ average cost basis that year — not mark-to-market. Index figures are calendar-year price returns.",
    overall: {
      youPct: portfolio.overall.returnPct,
      youPnl: portfolio.overall.pnl,
      youCapital: portfolio.overall.capital,
      sp500Pct: indexPeriodReturn(spBars, portfolio.firstInvestedAt, now),
      ftse100Pct: indexPeriodReturn(ftBars, portfolio.firstInvestedAt, now),
      years: portfolio.overall.years,
    },
    years,
    benchmarks: BENCHMARKS.map((b) => ({ id: b.id, label: b.label, symbol: b.symbol })),
  };
}
