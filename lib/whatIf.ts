import type { HistoryBar } from "@trader/shared";
import type { ParsedFreetradeTx } from "./freetrade";

/**
 * "What if I never sold?" counterfactual for a single position.
 *
 * Three paths are valued day by day, all starting from the same buys:
 *  - actual:     shares still held, marked to market, plus cash taken out of sells, plus dividends
 *  - neverSold:  every share ever bought, still held today, plus dividends scaled to that share count
 *  - reinvested: the actual path, but sell proceeds rolled into a benchmark index instead of sitting in cash
 *
 * Yahoo daily closes are split-adjusted, broker quantities are as-traded, so quantities are
 * converted to today-equivalent shares before being multiplied by a price.
 */

const MAX_SERIES_POINTS = 420;

export type WhatIfSale = {
  date: string;
  /** Shares as they appeared on the contract note. */
  quantity: number;
  /** The same shares restated in today's terms (differs only after a split). */
  adjustedQuantity: number;
  /** Sell price per share, position currency, as traded. */
  price: number | null;
  /** Sell price per share restated in today's share terms (differs only after a split). */
  adjustedPrice: number | null;
  proceeds: number;
  /** Price per share today, position currency. */
  priceToday: number | null;
  /** What those shares would be worth today. */
  valueToday: number | null;
  /** valueToday - proceeds. Positive means selling cost you money. */
  missed: number | null;
  missedPct: number | null;
  /** Proceeds rolled into the benchmark from the sale date. */
  benchmarkValueToday: number | null;
};

export type WhatIfPoint = {
  time: number;
  actual: number;
  neverSold: number;
  reinvested: number | null;
  invested: number;
};

export type WhatIfPath = {
  /** Shares held today under this path. */
  shares: number;
  /** Market value of those shares today. */
  marketValue: number;
  /** Cash realized from sells that is not in the market. */
  cash: number;
  dividends: number;
  /** marketValue + cash + dividends */
  totalValue: number;
  /** totalValue - invested */
  totalPnl: number;
  returnPct: number | null;
};

export type WhatIfResult = {
  key: string;
  symbol: string;
  displayName: string | null;
  currency: string;
  quoteCurrency: string;
  asOf: string;
  firstBoughtAt: string;
  lastSoldAt: string | null;
  priceNow: number;
  invested: number;
  sharesSold: number;
  sharesStillHeld: number;
  status: "open" | "closed";
  actual: WhatIfPath;
  neverSold: WhatIfPath;
  reinvested: (WhatIfPath & { label: string; symbol: string }) | null;
  /** neverSold.totalPnl - actual.totalPnl. Positive = selling cost you this much. */
  difference: number;
  differencePct: number | null;
  verdict: "sell_cost_you" | "sell_saved_you" | "neutral";
  sales: WhatIfSale[];
  series: WhatIfPoint[];
  /** Trades whose share count was restated into today's terms. */
  quantityAdjustments: Array<{
    date: string;
    quantity: number;
    adjustedQuantity: number;
    factor: number;
    source: "price" | "ledger";
  }>;
  splitsApplied: Array<{ date: string; ratio: number; inferred: boolean }>;
  notes: string[];
};

export type WhatIfSeriesInput = {
  /** Daily closes in `currency` unless `fx` is given. */
  bars: HistoryBar[];
  /** Daily closes of <quote currency> → position currency, e.g. GBP per USD. */
  fx?: HistoryBar[];
};

export type WhatIfInput = {
  txs: ParsedFreetradeTx[];
  key: string;
  price: WhatIfSeriesInput;
  quoteCurrency: string;
  positionCurrency: string;
  benchmark?: {
    label: string;
    symbol: string;
    series: WhatIfSeriesInput;
  };
  now?: Date;
};

export type WhatIfFailure = {
  ok: false;
  reason: "no_position" | "no_sells" | "no_price_history" | "no_buys";
  message: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function groupKey(tx: ParsedFreetradeTx): string | null {
  if (tx.isin && tx.isin.trim()) return tx.isin.trim();
  if (tx.symbol) return tx.symbol;
  return null;
}

/** Step lookup over a sorted series: last value at or before `ts`, else the first value. */
export function makeStepLookup(bars: HistoryBar[]): (ts: number) => number | null {
  const points = bars
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .map((b) => ({ t: b.time, v: b.close }))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return () => null;

  return (ts: number) => {
    if (ts <= points[0]!.t) return points[0]!.v;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (points[mid]!.t <= ts) lo = mid;
      else hi = mid - 1;
    }
    return points[lo]!.v;
  };
}

/** Price in position currency at a unix-seconds timestamp. */
function makePriceLookup(input: WhatIfSeriesInput): (ts: number) => number | null {
  const price = makeStepLookup(input.bars);
  const fx = input.fx && input.fx.length > 0 ? makeStepLookup(input.fx) : null;
  return (ts: number) => {
    const p = price(ts);
    if (p == null) return null;
    if (!fx) return p;
    const rate = fx(ts);
    if (rate == null || !(rate > 0)) return null;
    return p * rate;
  };
}

type SplitEvent = { t: number; ratio: number; inferred: boolean };

/** A sell of far more shares than are held implies a split the export did not record. */
function inferSplitRatio(held: number, sellQty: number): number | null {
  if (held <= 1e-8 || sellQty <= held * 1.25) return null;
  const r = sellQty / held;
  const nearest = Math.round(r);
  if (nearest >= 3 && Math.abs(r - nearest) / nearest <= 0.03) return nearest;
  return null;
}

type Ledger = {
  buys: Array<{ t: number; qty: number; spend: number }>;
  sells: Array<{ t: number; qty: number; proceeds: number }>;
  dividends: Array<{ t: number; amount: number; eligibleQty: number | null }>;
  splits: SplitEvent[];
  symbol: string;
  displayName: string | null;
  currency: string;
};

/** Replay one position's transactions, capturing explicit and inferred splits. */
export function buildLedger(
  txs: ParsedFreetradeTx[],
  key: string,
  fallbackCurrency = "GBP",
): Ledger | null {
  const mine = txs
    .filter((tx) => groupKey(tx) === key && tx.tradedAt)
    .sort((a, b) => (a.tradedAt!.getTime() ?? 0) - (b.tradedAt!.getTime() ?? 0));
  if (mine.length === 0) return null;

  const ledger: Ledger = {
    buys: [],
    sells: [],
    dividends: [],
    splits: [],
    symbol: key,
    displayName: null,
    currency: fallbackCurrency,
  };

  let held = 0;

  for (const tx of mine) {
    const t = tx.tradedAt!.getTime();
    if (tx.symbol) ledger.symbol = tx.symbol;
    if (tx.title) ledger.displayName = tx.title;
    if (tx.currency) ledger.currency = tx.currency;

    const type = tx.type.trim().toUpperCase();

    if (type === "DIVIDEND" || type.includes("DIVIDEND")) {
      const amount = tx.totalAmount ?? 0;
      if (amount !== 0) {
        ledger.dividends.push({
          t,
          amount,
          eligibleQty: tx.quantity != null && tx.quantity > 0 ? tx.quantity : null,
        });
      }
      continue;
    }

    if (type.includes("SPLIT")) {
      const from = Number(tx.raw["stock split rate of share outturn from"] || "");
      const to = Number(tx.raw["stock split rate of share outturn to"] || "");
      if (from > 0 && to > 0) {
        const ratio = to / from;
        ledger.splits.push({ t, ratio, inferred: false });
        held *= ratio;
      }
      continue;
    }

    if (!tx.side || tx.quantity == null || tx.quantity <= 0) continue;

    if (tx.side === "buy") {
      const spend =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * tx.quantity
            : 0;
      ledger.buys.push({ t, qty: tx.quantity, spend });
      held += tx.quantity;
    } else {
      const ratio = inferSplitRatio(held, tx.quantity);
      if (ratio) {
        // Dated just before the sell so earlier buys are scaled up but this sell is not.
        ledger.splits.push({ t: t - 1, ratio, inferred: true });
        held *= ratio;
      }
      const proceeds =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * tx.quantity
            : 0;
      ledger.sells.push({ t, qty: tx.quantity, proceeds });
      held = Math.max(0, held - tx.quantity);
    }
  }

  return ledger;
}

/**
 * Plausible ratios between shares as traded and shares today: forward splits,
 * reverse splits, and the 100x that shows up when a quote is in pence but the
 * broker booked pounds.
 */
const SPLIT_CANDIDATES = (() => {
  const forward = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 25, 30, 40, 50, 100];
  return [...forward, ...forward.filter((n) => n > 1).map((n) => 1 / n)].sort((a, b) => a - b);
})();

/**
 * Tolerance covers intraday vs close, dealing fees and FX drift. Kept tight enough that a
 * ratio sitting between two candidates is rejected and the ledger factor is used instead.
 */
const SPLIT_SNAP_TOLERANCE = 0.07;

/** Snap a traded-price ÷ adjusted-price ratio onto a split factor, or null if it is not close to one. */
export function snapSplitFactor(observed: number): number | null {
  if (!Number.isFinite(observed) || observed <= 0) return null;
  let best: number | null = null;
  let bestError = Infinity;
  for (const candidate of SPLIT_CANDIDATES) {
    const error = Math.abs(observed - candidate) / candidate;
    if (error < bestError) {
      bestError = error;
      best = candidate;
    }
  }
  return best != null && bestError <= SPLIT_SNAP_TOLERANCE ? best : null;
}

/** Multiplier turning shares held at `t` into today-equivalent (split-adjusted) shares. */
function makeSplitAdjuster(splits: SplitEvent[]): (t: number) => number {
  const sorted = [...splits].sort((a, b) => a.t - b.t);
  return (t: number) => {
    let factor = 1;
    for (const s of sorted) if (s.t > t) factor *= s.ratio;
    return factor;
  };
}

function pathOf(
  shares: number,
  price: number,
  cash: number,
  dividends: number,
  invested: number,
): WhatIfPath {
  const marketValue = shares * price;
  const totalValue = marketValue + cash + dividends;
  const totalPnl = totalValue - invested;
  return {
    shares: Math.round(shares * 1e6) / 1e6,
    marketValue: round2(marketValue),
    cash: round2(cash),
    dividends: round2(dividends),
    totalValue: round2(totalValue),
    totalPnl: round2(totalPnl),
    returnPct: invested > 0 ? round1((totalPnl / invested) * 100) : null,
  };
}

function downsample<T>(rows: T[], max = MAX_SERIES_POINTS): T[] {
  if (rows.length <= max) return rows;
  const stride = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += stride) out.push(rows[i]!);
  const last = rows[rows.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function computeWhatIf(input: WhatIfInput): WhatIfResult | WhatIfFailure {
  const now = input.now ?? new Date();
  const ledger = buildLedger(input.txs, input.key, input.positionCurrency);

  if (!ledger) {
    return { ok: false, reason: "no_position", message: "No transactions for this position." };
  }
  if (ledger.buys.length === 0) {
    return { ok: false, reason: "no_buys", message: "No buys recorded for this position." };
  }
  if (ledger.sells.length === 0) {
    return {
      ok: false,
      reason: "no_sells",
      message: "You never sold this one — there is nothing to replay.",
    };
  }

  const priceAt = makePriceLookup(input.price);
  const nowTs = Math.floor(now.getTime() / 1000);
  const priceNow = priceAt(nowTs);
  if (priceNow == null || !(priceNow > 0)) {
    return {
      ok: false,
      reason: "no_price_history",
      message: `No price history available for ${ledger.symbol}.`,
    };
  }

  const benchAt = input.benchmark ? makePriceLookup(input.benchmark.series) : null;
  const adjust = makeSplitAdjuster(ledger.splits);

  /**
   * Broker quantities are as traded; Yahoo closes are split-adjusted. The ratio between the
   * price on the contract note and the adjusted close that day is the split factor since,
   * which catches splits the CSV never recorded. Falls back to the ledger's own split rows.
   */
  const adjustments: WhatIfResult["quantityAdjustments"] = [];
  function factorFor(t: number, qty: number, cash: number): number {
    const ledgerFactor = adjust(t);
    const tradedPrice = qty > 0 ? cash / qty : 0;
    const market = priceAt(Math.floor(t / 1000));
    const snapped =
      tradedPrice > 0 && market != null && market > 0
        ? snapSplitFactor(tradedPrice / market)
        : null;
    const factor = snapped ?? ledgerFactor;
    if (Math.abs(factor - 1) > 1e-9) {
      adjustments.push({
        date: new Date(t).toISOString(),
        quantity: Math.round(qty * 1e6) / 1e6,
        adjustedQuantity: Math.round(qty * factor * 1e6) / 1e6,
        factor: Math.round(factor * 1e6) / 1e6,
        source: snapped != null ? "price" : "ledger",
      });
    }
    return factor;
  }

  const buys = ledger.buys.map((b) => {
    const factor = factorFor(b.t, b.qty, b.spend);
    return { ...b, factor, adjQty: b.qty * factor };
  });
  const sells = ledger.sells.map((s) => {
    const factor = factorFor(s.t, s.qty, s.proceeds);
    return { ...s, factor, adjQty: s.qty * factor };
  });

  const invested = buys.reduce((sum, b) => sum + b.spend, 0);
  const firstBoughtAt = new Date(Math.min(...buys.map((b) => b.t)));
  const lastSoldAt = new Date(Math.max(...sells.map((s) => s.t)));

  const sharesBoughtAdj = buys.reduce((sum, b) => sum + b.adjQty, 0);
  const sharesSoldAdj = sells.reduce((sum, s) => sum + s.adjQty, 0);

  // --- daily walk -------------------------------------------------------
  const sortedEvents = {
    buys: [...buys].sort((a, b) => a.t - b.t),
    sells: [...sells].sort((a, b) => a.t - b.t),
    dividends: [...ledger.dividends].sort((a, b) => a.t - b.t),
  };

  /** Shares held on each path, and cash, as of a timestamp. */
  function stateAt(ts: number) {
    let boughtAdj = 0;
    let investedTo = 0;
    for (const b of sortedEvents.buys) {
      if (b.t > ts) break;
      boughtAdj += b.adjQty;
      investedTo += b.spend;
    }
    let soldAdj = 0;
    let cash = 0;
    for (const s of sortedEvents.sells) {
      if (s.t > ts) break;
      soldAdj += s.adjQty;
      cash += s.proceeds;
    }
    return {
      actualShares: Math.max(0, boughtAdj - soldAdj),
      neverSoldShares: boughtAdj,
      cash,
      invested: investedTo,
    };
  }

  /**
   * Dividends on each path. The never-sold path is scaled by how many more shares it
   * would have been holding on the ex-date.
   */
  function dividendsAt(ts: number) {
    let actual = 0;
    let neverSold = 0;
    for (const d of sortedEvents.dividends) {
      if (d.t > ts) break;
      actual += d.amount;
      const st = stateAt(d.t);
      const factor = adjust(d.t);
      const denom =
        st.actualShares > 1e-8
          ? st.actualShares
          : d.eligibleQty != null
            ? d.eligibleQty * factor
            : 0;
      neverSold += denom > 1e-8 ? d.amount * (st.neverSoldShares / denom) : d.amount;
    }
    return { actual, neverSold };
  }

  /** Units of the benchmark bought with each sell's proceeds. */
  const benchUnits: Array<{ t: number; units: number }> = [];
  if (benchAt) {
    for (const s of sortedEvents.sells) {
      const px = benchAt(Math.floor(s.t / 1000));
      if (px != null && px > 0) benchUnits.push({ t: s.t, units: s.proceeds / px });
    }
  }
  function benchValueAt(ts: number): number | null {
    if (!benchAt) return null;
    const px = benchAt(ts);
    if (px == null || !(px > 0)) return null;
    let units = 0;
    for (const u of benchUnits) {
      if (u.t > ts * 1000) break;
      units += u.units;
    }
    return units * px;
  }

  const startTs = Math.floor(firstBoughtAt.getTime() / 1000);
  const seenDays = new Set<number>();
  const rawSeries: WhatIfPoint[] = [];
  const dayStamps: number[] = [];
  for (const bar of input.price.bars) {
    if (bar.time < startTs || bar.time > nowTs) continue;
    const day = Math.floor(bar.time / 86_400);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    dayStamps.push(bar.time);
  }
  // Always finish on `now` so the last point of the chart equals the headline totals.
  if (dayStamps[dayStamps.length - 1] !== nowTs) dayStamps.push(nowTs);

  for (const ts of dayStamps) {
    const px = priceAt(ts);
    if (px == null || !(px > 0)) continue;
    const st = stateAt(ts * 1000);
    const div = dividendsAt(ts * 1000);
    const bench = benchValueAt(ts);
    rawSeries.push({
      time: ts,
      actual: round2(st.actualShares * px + st.cash + div.actual),
      neverSold: round2(st.neverSoldShares * px + div.neverSold),
      reinvested: bench == null ? null : round2(st.actualShares * px + bench + div.actual),
      invested: round2(st.invested),
    });
  }

  // --- today's totals ---------------------------------------------------
  const finalState = stateAt(now.getTime());
  const finalDiv = dividendsAt(now.getTime());
  const actual = pathOf(
    finalState.actualShares,
    priceNow,
    finalState.cash,
    finalDiv.actual,
    invested,
  );
  const neverSold = pathOf(finalState.neverSoldShares, priceNow, 0, finalDiv.neverSold, invested);

  const benchNow = benchValueAt(nowTs);
  const reinvested =
    input.benchmark && benchNow != null
      ? {
          ...pathOf(finalState.actualShares, priceNow, benchNow, finalDiv.actual, invested),
          label: input.benchmark.label,
          symbol: input.benchmark.symbol,
        }
      : null;

  // --- per-sale breakdown ----------------------------------------------
  const sales: WhatIfSale[] = sortedEvents.sells.map((s) => {
    const factor = s.factor;
    const adjQty = s.adjQty;
    const valueToday = adjQty * priceNow;
    const price = s.qty > 0 ? s.proceeds / s.qty : null;
    const adjustedPrice = price != null && factor > 0 ? price / factor : null;
    const missed = valueToday - s.proceeds;
    const benchPx = benchAt ? benchAt(Math.floor(s.t / 1000)) : null;
    const benchNowPx = benchAt ? benchAt(nowTs) : null;
    return {
      date: new Date(s.t).toISOString(),
      quantity: Math.round(s.qty * 1e6) / 1e6,
      adjustedQuantity: Math.round(adjQty * 1e6) / 1e6,
      price: price != null ? round2(price) : null,
      adjustedPrice: adjustedPrice != null ? round2(adjustedPrice) : null,
      proceeds: round2(s.proceeds),
      priceToday: round2(priceNow),
      valueToday: round2(valueToday),
      missed: round2(missed),
      missedPct: s.proceeds > 0 ? round1((missed / s.proceeds) * 100) : null,
      benchmarkValueToday:
        benchPx != null && benchPx > 0 && benchNowPx != null
          ? round2((s.proceeds / benchPx) * benchNowPx)
          : null,
    };
  });

  const difference = round2(neverSold.totalPnl - actual.totalPnl);
  const notes: string[] = [
    "Prices are Yahoo daily closes, split-adjusted. Quantities are restated in today's share terms.",
    "The never-sold path assumes the sale never happened and nothing else changed — same buys, same dates.",
  ];
  if (input.quoteCurrency.toUpperCase() !== input.positionCurrency.toUpperCase()) {
    notes.push(
      `Converted from ${input.quoteCurrency.toUpperCase()} to ${input.positionCurrency.toUpperCase()} at each day's rate.`,
    );
  }
  if (ledger.dividends.length > 0) {
    notes.push("Dividends on the never-sold path are scaled by the extra shares it would hold.");
  }
  if (adjustments.some((a) => a.source === "price")) {
    notes.push(
      "Some trades predate a share split the export does not record, so their quantities were restated from the traded price.",
    );
  }
  if (adjustments.some((a) => a.source === "ledger")) {
    notes.push("A share split was applied from the broker's own split rows.");
  }
  if (reinvested) {
    notes.push(
      `The reinvested path puts each sale's proceeds into ${reinvested.label} on the sale date.`,
    );
  }

  return {
    key: input.key,
    symbol: ledger.symbol,
    displayName: ledger.displayName,
    currency: input.positionCurrency,
    quoteCurrency: input.quoteCurrency,
    asOf: now.toISOString(),
    firstBoughtAt: firstBoughtAt.toISOString(),
    lastSoldAt: lastSoldAt.toISOString(),
    priceNow: round2(priceNow),
    invested: round2(invested),
    sharesSold: Math.round(sharesSoldAdj * 1e6) / 1e6,
    sharesStillHeld: Math.round(Math.max(0, sharesBoughtAdj - sharesSoldAdj) * 1e6) / 1e6,
    status: finalState.actualShares > 1e-8 ? "open" : "closed",
    actual,
    neverSold,
    reinvested,
    difference,
    differencePct: invested > 0 ? round1((difference / invested) * 100) : null,
    verdict: difference > 1 ? "sell_cost_you" : difference < -1 ? "sell_saved_you" : "neutral",
    sales,
    series: downsample(rawSeries),
    quantityAdjustments: adjustments,
    splitsApplied: ledger.splits.map((s) => ({
      date: new Date(s.t).toISOString(),
      ratio: s.ratio,
      inferred: s.inferred,
    })),
    notes,
  };
}

export function isWhatIfFailure(r: WhatIfResult | WhatIfFailure): r is WhatIfFailure {
  return (r as WhatIfFailure).ok === false;
}
