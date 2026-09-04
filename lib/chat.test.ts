import { describe, expect, it } from "vitest";
import { buildPortfolioBrief, buildSystemPrompt, type ChatContext } from "./chat";
import type { PortfolioPerformance, SymbolPerformance } from "@trader/shared";

function position(over: Partial<SymbolPerformance> & { symbol: string }): SymbolPerformance {
  return {
    key: over.symbol,
    aliases: [],
    displayName: null,
    isin: null,
    status: "open",
    quantityHeld: 10,
    buyCount: 1,
    sellCount: 0,
    sharesBought: 10,
    sharesSold: 0,
    invested: 1000,
    proceeds: 0,
    dividends: 0,
    fees: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    returnPct: 0,
    averageCost: 100,
    averageBuyPrice: 100,
    averageSellPrice: null,
    costBasis: 1000,
    marketValue: 1000,
    price: 100,
    priceCurrency: "GBP",
    firstBoughtAt: "2024-01-02T00:00:00.000Z",
    lastActivityAt: "2024-01-02T00:00:00.000Z",
    holdDays: 100,
    currency: "GBP",
    trades: [],
    ...over,
  };
}

function performance(over: Partial<PortfolioPerformance> = {}): PortfolioPerformance {
  return {
    currency: "GBP",
    generatedAt: "2026-01-01T00:00:00.000Z",
    symbolCount: 0,
    openCount: 0,
    closedCount: 0,
    invested: 0,
    proceeds: 0,
    dividends: 0,
    interest: 0,
    deposits: 0,
    withdrawals: 0,
    fees: 0,
    realizedPnl: 0,
    realizedProfit: 0,
    realizedLoss: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    winCount: 0,
    lossCount: 0,
    winRatePct: null,
    best: null,
    worst: null,
    insights: [],
    positions: [],
    series: [],
    ...over,
  };
}

function context(over: Partial<ChatContext> = {}): ChatContext {
  return {
    currency: "GBP",
    performance: null,
    holdings: [],
    watchlist: [],
    alerts: [],
    opportunities: [],
    asOf: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("buildPortfolioBrief", () => {
  it("says the book is empty rather than inventing one", () => {
    const brief = buildPortfolioBrief(context());
    expect(brief).toContain("No broker data imported yet");
    expect(brief).toContain("Nothing recorded.");
  });

  it("carries the headline figures with their signs intact", () => {
    const brief = buildPortfolioBrief(
      context({
        performance: performance({
          realizedPnl: -1250.5,
          totalPnl: -1250.5,
          winCount: 2,
          lossCount: 3,
          winRatePct: 40,
          best: { symbol: "AAPL", displayName: null, pnl: 900 },
          worst: { symbol: "BABA", displayName: null, pnl: -2100 },
        }),
      }),
    );
    expect(brief).toContain("Realised P&L: -GBP 1250.50");
    expect(brief).toContain("Win rate: +40.00%");
    expect(brief).toContain("Worst: BABA -GBP 2100.00");
  });

  it("keeps the positions worth asking about when the list is truncated", () => {
    const positions = Array.from({ length: 60 }, (_, i) =>
      position({ symbol: `SYM${i}`, totalPnl: i }),
    );
    const brief = buildPortfolioBrief(
      context({ performance: performance({ positions }) }),
    );
    // Largest absolute P&L survives; the flattest ones are the ones dropped.
    expect(brief).toContain("SYM59");
    expect(brief).not.toContain("SYM0:");
    expect(brief).toContain("Open positions (60)");
  });

  it("separates open from closed", () => {
    const brief = buildPortfolioBrief(
      context({
        performance: performance({
          positions: [
            position({ symbol: "OPEN", totalPnl: 10 }),
            position({ symbol: "SHUT", status: "closed", totalPnl: -10 }),
          ],
        }),
      }),
    );
    expect(brief).toMatch(/Open positions \(1\)\n- OPEN/);
    expect(brief).toMatch(/Closed positions \(1\)\n- SHUT/);
    expect(brief).toContain("SHUT: closed");
  });

  it("attaches the opportunity score to the watchlist row", () => {
    const brief = buildPortfolioBrief(
      context({
        watchlist: [
          { symbol: "NVDA", displayName: "NVIDIA", score: 71 },
          { symbol: "TSLA", displayName: null, score: null },
        ],
      }),
    );
    expect(brief).toContain("- NVDA (NVIDIA), opportunity score 71");
    expect(brief).toContain("- TSLA");
    expect(brief).not.toContain("TSLA, opportunity score");
  });
});

describe("buildSystemPrompt", () => {
  it("puts the rules before the figures", () => {
    const prompt = buildSystemPrompt(context());
    expect(prompt.indexOf("Never invent a price")).toBeLessThan(
      prompt.indexOf("Portfolio as of"),
    );
  });
});
