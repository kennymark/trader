import { describe, expect, it } from "vitest";
import {
  computeHoldingsFromTrades,
  computePortfolioPerformance,
  parseCsv,
  parseFreetradeCsv,
} from "./freetrade";

const SAMPLE = `Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount
S&P 500,ORDER,2022-02-01T15:09:49.696Z,GBP,1256.78,BUY,SPXP,IE00B3YCGJ38,628.39000000,0.00,2.00000000,London Stock Exchange,PYJAGIY7EMQN,MARKET,GBP,1256.78,628.39000000,,,,,,,,,,,,
Tesla,ORDER,2022-02-01T15:03:12.817Z,GBP,464.38,BUY,TSLA,US88160R1014,674.85659078,0.00,0.68503443,Drivewealth,JA2UNVA48W11,MARKET,USD,623.58,910.29000000,1.34281004,1.34888000,45,2.08,,,,,,,,
Tesla,ORDER,2022-02-01T15:14:23.014Z,GBP,5.59,BUY,TSLA,US88160R1014,678.77225238,0.00,0.00819126,Drivewealth,AMN762KCC2G3,MARKET,USD,7.50,915.61000000,1.34403451,1.35011000,45,0.03,,,,,,,,
S&P 500,ORDER,2024-01-16T10:01:02.811Z,GBP,2930.36,SELL,SPXP,IE00B3YCGJ38,732.59000000,0.00,4.00000000,London Stock Exchange,PEJJSM8NABDD,BASIC,GBP,2930.36,732.59000000,,,,,,,,,,,,
Nasdaq,DIVIDEND,2023-12-22T17:11:00.000Z,GBP,0.93,,NDAQ,US6311031081,,,6.36545916,,,,USD,,,,0.78491703,0,0.00,2023-12-07,2023-12-22,6.36545916,0.22000000,1.40,1.19,15,0.21
Interest,INTEREST_FROM_CASH,2023-10-16T00:00:00.000Z,GBP,9.02,,,,,,,,,,,,,,,,,,,,,,,,
`;

describe("freetrade csv", () => {
  it("parses quoted csv fields", () => {
    const rows = parseCsv('a,b\n"1,2",3\n');
    expect(rows[1]).toEqual(["1,2", "3"]);
  });

  it("parses freetrade activity export", () => {
    const txs = parseFreetradeCsv(SAMPLE);
    expect(txs.length).toBeGreaterThan(4);
    const buys = txs.filter((t) => t.side === "buy");
    const sells = txs.filter((t) => t.side === "sell");
    expect(buys.some((t) => t.symbol === "TSLA")).toBe(true);
    expect(sells.some((t) => t.symbol === "SPXP")).toBe(true);
    const dividend = txs.find((t) => t.type === "DIVIDEND");
    expect(dividend?.side).toBeNull();
  });

  it("computes open holdings with average cost", () => {
    const txs = parseFreetradeCsv(SAMPLE);
    const holdings = computeHoldingsFromTrades(txs);
    // SPXP: bought 2, sold 4 → closed (no leftover from this sample alone if only 2 bought)
    // Actually sample has one buy of 2 then sell of 4 → quantity floors to 0
    expect(holdings.find((h) => h.symbol === "SPXP")).toBeUndefined();
    const tsla = holdings.find((h) => h.symbol === "TSLA");
    expect(tsla).toBeTruthy();
    expect(tsla!.quantity).toBeCloseTo(0.68503443 + 0.00819126, 6);
    expect(tsla!.costBasis).toBeCloseTo(464.38 + 5.59, 2);
  });

  it("rejects non-freetrade csv", () => {
    expect(() => parseFreetradeCsv("foo,bar\n1,2\n")).toThrow(/Freetrade/i);
  });

  it("computes realized pnl and merges ticker changes", () => {
    const csv = `${SAMPLE.trim()}
Square,ORDER,2022-03-01T12:00:00.000Z,GBP,100.00,BUY,SQ,US8522341036,10.00,0.00,10.00000000,Drivewealth,AAA,MARKET,USD,100.00,10.00,1.3,1.3,59,1.00,,,,,,,,
Block,ORDER,2024-03-01T12:00:00.000Z,GBP,80.00,SELL,XYZ,US8522341036,8.00,0.00,10.00000000,Drivewealth,BBB,MARKET,USD,80.00,8.00,1.3,1.3,59,0.50,,,,,,,,
`;
    const txs = parseFreetradeCsv(csv);
    const perf = computePortfolioPerformance(txs, { now: new Date("2024-03-02T00:00:00Z") });
    const spxp = perf.positions.find((p) => p.symbol === "SPXP");
    expect(spxp?.status).toBe("closed");
    expect(spxp?.realizedPnl).toBeCloseTo(208.4, 1);

    const tsla = perf.positions.find((p) => p.symbol === "TSLA");
    expect(tsla?.status).toBe("open");
    expect(tsla?.realizedPnl).toBeCloseTo(0, 2);

    const block = perf.positions.find((p) => p.isin === "US8522341036");
    expect(block?.symbol).toBe("XYZ");
    expect(block?.aliases).toContain("SQ");
    expect(block?.realizedPnl).toBeCloseTo(-20, 1);
    expect(perf.lossCount).toBeGreaterThanOrEqual(1);
    expect(perf.insights.length).toBeGreaterThan(0);
    expect(perf.series.length).toBeGreaterThan(0);
    expect(perf.series[perf.series.length - 1]!.cumulative).toBeCloseTo(
      perf.realizedPnl + perf.dividends,
      1,
    );
  });

  it("infers stock splits when a sell is a clean multiple of shares held", () => {
    const csv = `Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity
Amazon,ORDER,2020-11-01T12:00:00.000Z,GBP,100.00,BUY,AMZN,US0231351067,50.00,0.00,2.00000000
Amazon,ORDER,2025-08-20T12:00:00.000Z,GBP,300.00,SELL,AMZN,US0231351067,7.50,0.00,40.00000000
`;
    const perf = computePortfolioPerformance(parseFreetradeCsv(csv));
    const amzn = perf.positions.find((p) => p.symbol === "AMZN");
    expect(amzn?.status).toBe("closed");
    expect(amzn?.realizedPnl).toBeCloseTo(200, 1);
  });
});
