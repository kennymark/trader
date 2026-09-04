import { describe, expect, it } from "vitest";
import type { HistoryBar } from "@trader/shared";
import {
  buildLedger,
  computeWhatIf,
  isWhatIfFailure,
  makeStepLookup,
  snapSplitFactor,
} from "./whatIf";
import type { ParsedFreetradeTx } from "./freetrade";

function tx(partial: Partial<ParsedFreetradeTx>): ParsedFreetradeTx {
  return {
    externalId: null,
    type: "ORDER",
    side: null,
    symbol: "ACME",
    isin: "US0000000001",
    title: "Acme",
    account: "GIA",
    quantity: null,
    price: null,
    totalAmount: null,
    currency: "GBP",
    fxFeeAmount: null,
    stampDuty: null,
    tradedAt: null,
    raw: {},
    ...partial,
  };
}

/** Daily bars at a flat price, then a step to `endPrice` halfway through. */
function bars(startIso: string, days: number, startPrice: number, endPrice: number): HistoryBar[] {
  const start = Math.floor(new Date(startIso).getTime() / 1000);
  const out: HistoryBar[] = [];
  for (let i = 0; i < days; i++) {
    const close = i < days / 2 ? startPrice : endPrice;
    out.push({ time: start + i * 86_400, open: close, high: close, low: close, close });
  }
  return out;
}

const NOW = new Date("2024-01-01T00:00:00Z");

describe("makeStepLookup", () => {
  it("returns the last value at or before the timestamp", () => {
    const at = makeStepLookup([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 2, high: 2, low: 2, close: 2 },
    ]);
    expect(at(50)).toBe(1);
    expect(at(100)).toBe(1);
    expect(at(150)).toBe(1);
    expect(at(999)).toBe(2);
  });

  it("ignores non-positive closes", () => {
    const at = makeStepLookup([{ time: 100, open: 0, high: 0, low: 0, close: 0 }]);
    expect(at(100)).toBeNull();
  });
});

describe("buildLedger", () => {
  it("collects buys, sells and dividends for one key", () => {
    const ledger = buildLedger(
      [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2023-01-01") }),
        tx({ type: "DIVIDEND", quantity: 10, totalAmount: 5, tradedAt: new Date("2022-06-01") }),
        tx({ symbol: "OTHER", isin: "US0000000002", side: "buy", quantity: 1, totalAmount: 9, tradedAt: new Date("2022-01-01") }),
      ],
      "US0000000001",
    )!;
    expect(ledger.buys).toHaveLength(1);
    expect(ledger.sells).toHaveLength(1);
    expect(ledger.dividends).toHaveLength(1);
    expect(ledger.symbol).toBe("ACME");
  });

  it("infers a split when a sell exceeds the recorded holding", () => {
    const ledger = buildLedger(
      [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 40, totalAmount: 200, tradedAt: new Date("2023-01-01") }),
      ],
      "US0000000001",
    )!;
    expect(ledger.splits).toHaveLength(1);
    expect(ledger.splits[0]!.ratio).toBe(4);
    expect(ledger.splits[0]!.inferred).toBe(true);
  });
});

describe("computeWhatIf", () => {
  const priceBars = bars("2022-01-01T00:00:00Z", 730, 10, 30);

  it("refuses positions that were never sold", () => {
    const result = computeWhatIf({
      txs: [tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") })],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    expect(isWhatIfFailure(result) && result.reason).toBe("no_sells");
  });

  it("values the never-sold path at today's price", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);

    expect(result.status).toBe("closed");
    expect(result.priceNow).toBe(30);
    // Sold everything: actual value is the £150 of cash, P&L £50.
    expect(result.actual.totalValue).toBe(150);
    expect(result.actual.totalPnl).toBe(50);
    // Held: 10 shares × £30 = £300, P&L £200.
    expect(result.neverSold.totalValue).toBe(300);
    expect(result.neverSold.totalPnl).toBe(200);
    expect(result.difference).toBe(150);
    expect(result.verdict).toBe("sell_cost_you");
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]!.missed).toBe(150);
  });

  it("reports selling as the better call when the price fell", () => {
    const falling = bars("2022-01-01T00:00:00Z", 730, 20, 5);
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 200, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 200, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: falling },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.neverSold.totalValue).toBe(50);
    expect(result.difference).toBe(-150);
    expect(result.verdict).toBe("sell_saved_you");
  });

  it("handles a partial sell with shares still held", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 4, totalAmount: 60, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.status).toBe("open");
    expect(result.sharesStillHeld).toBe(6);
    // 6 shares × £30 + £60 cash = £240
    expect(result.actual.totalValue).toBe(240);
    expect(result.neverSold.totalValue).toBe(300);
    expect(result.difference).toBe(60);
  });

  it("scales never-sold dividends by the extra shares held", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 5, totalAmount: 75, tradedAt: new Date("2022-03-01") }),
        tx({ type: "DIVIDEND", quantity: 5, totalAmount: 5, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.actual.dividends).toBe(5);
    // Holding 10 instead of 5 shares would have paid double.
    expect(result.neverSold.dividends).toBe(10);
  });

  it("restates pre-split quantities into today's shares", () => {
    // Adjusted closes sit at a quarter of the traded price before the 4:1 split.
    const splitBars = bars("2022-01-01T00:00:00Z", 730, 2.5, 30);
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({
          type: "SPLIT",
          tradedAt: new Date("2022-03-01"),
          raw: {
            "stock split rate of share outturn from": "1",
            "stock split rate of share outturn to": "4",
          },
        }),
        tx({ side: "sell", quantity: 40, totalAmount: 100, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: splitBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    // 10 pre-split shares are 40 today, worth 40 × £30.
    expect(result.neverSold.shares).toBe(40);
    expect(result.neverSold.totalValue).toBe(1200);
    expect(result.splitsApplied).toHaveLength(1);
  });

  it("converts a foreign-currency quote with the daily FX series", () => {
    const result = computeWhatIf({
      txs: [
        // £5/share matches $10 × 0.5, so no split calibration should fire.
        tx({ side: "buy", quantity: 10, totalAmount: 50, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars, fx: bars("2022-01-01T00:00:00Z", 730, 0.5, 0.5) },
      quoteCurrency: "USD",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    // $30 × 0.5 = £15 per share.
    expect(result.priceNow).toBe(15);
    expect(result.neverSold.totalValue).toBe(150);
    expect(result.notes.some((n) => n.includes("USD"))).toBe(true);
  });

  it("rolls sale proceeds into the benchmark for the reinvested path", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      benchmark: {
        label: "S&P 500",
        symbol: "^GSPC",
        // Doubles over the window, so £150 of proceeds becomes £300.
        series: { bars: bars("2022-01-01T00:00:00Z", 730, 100, 200) },
      },
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.reinvested?.totalValue).toBe(300);
    expect(result.sales[0]!.benchmarkValueToday).toBe(300);
  });

  it("emits a bounded, chronological value series", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: priceBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.series.length).toBeGreaterThan(10);
    expect(result.series.length).toBeLessThanOrEqual(421);
    const times = result.series.map((p) => p.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(result.series[result.series.length - 1]!.neverSold).toBe(300);
    // The chart must land exactly on the headline numbers.
    const last = result.series[result.series.length - 1]!;
    expect(last.actual).toBe(result.actual.totalValue);
    expect(last.neverSold).toBe(result.neverSold.totalValue);
  });
});

describe("snapSplitFactor", () => {
  it("snaps a ratio close to a real split", () => {
    expect(snapSplitFactor(10.14)).toBe(10);
    expect(snapSplitFactor(20.2)).toBe(20);
    expect(snapSplitFactor(1.02)).toBe(1);
  });

  it("snaps reverse splits and pence quoting", () => {
    expect(snapSplitFactor(0.104)).toBeCloseTo(0.1, 5);
    expect(snapSplitFactor(0.0101)).toBeCloseTo(0.01, 5);
  });

  it("refuses ratios that sit between candidates", () => {
    expect(snapSplitFactor(1.5)).toBeNull();
    expect(snapSplitFactor(13.5)).toBeNull();
    expect(snapSplitFactor(0.7)).toBeNull();
    expect(snapSplitFactor(0)).toBeNull();
    expect(snapSplitFactor(Number.NaN)).toBeNull();
  });
});

describe("quantity calibration", () => {
  it("restates a pre-split buy the export never flagged", () => {
    // Bought 1 share at £500 when the adjusted series says £50 → a 10:1 split since.
    const flat: HistoryBar[] = [];
    const start = Math.floor(new Date("2022-01-01").getTime() / 1000);
    for (let i = 0; i < 800; i++) {
      const close = i < 400 ? 50 : 80;
      flat.push({ time: start + i * 86_400, open: close, high: close, low: close, close });
    }
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 1, totalAmount: 500, tradedAt: new Date("2022-02-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 700, tradedAt: new Date("2023-03-01") }),
      ],
      key: "US0000000001",
      price: { bars: flat },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: new Date("2024-03-01"),
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    // The single pre-split share is 10 shares today, worth 10 × £80.
    expect(result.neverSold.shares).toBe(10);
    expect(result.neverSold.totalValue).toBe(800);
    expect(result.quantityAdjustments).toHaveLength(1);
    expect(result.quantityAdjustments[0]!.factor).toBe(10);
    expect(result.quantityAdjustments[0]!.source).toBe("price");
  });

  it("leaves ordinary trades untouched", () => {
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 150, tradedAt: new Date("2022-06-01") }),
      ],
      key: "US0000000001",
      price: { bars: bars("2022-01-01T00:00:00Z", 730, 10, 30) },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    expect(result.quantityAdjustments).toHaveLength(0);
    expect(result.neverSold.shares).toBe(10);
  });
});

describe("sale rows", () => {
  it("reports both the traded and restated share counts", () => {
    const splitBars = bars("2022-01-01T00:00:00Z", 730, 2.5, 30);
    const result = computeWhatIf({
      txs: [
        tx({ side: "buy", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-01-01") }),
        tx({ side: "sell", quantity: 10, totalAmount: 100, tradedAt: new Date("2022-03-01") }),
      ],
      key: "US0000000001",
      price: { bars: splitBars },
      quoteCurrency: "GBP",
      positionCurrency: "GBP",
      now: NOW,
    });
    if (isWhatIfFailure(result)) throw new Error(result.message);
    const sale = result.sales[0]!;
    expect(sale.quantity).toBe(10);
    expect(sale.adjustedQuantity).toBe(40);
    expect(sale.price).toBe(10);
    expect(sale.adjustedPrice).toBe(2.5);
    // The restated shares at today's price are what the row must compare against.
    expect(sale.valueToday).toBe(40 * result.priceNow);
  });
});
