import { describe, expect, it } from "vitest";
import { assignCategories, computeOpportunityScores } from "./scoring.js";
import { defaultAssumptionsFromFundamentals, simulateScenarios } from "./scenarios.js";
import { findHistoricalPatterns } from "./patterns.js";
import type { HistoryBar } from "@trader/shared";

describe("computeOpportunityScores", () => {
  it("scores a strong setup higher than a weak one", () => {
    const strong = computeOpportunityScores({
      price: 100,
      targetPrice: 130,
      upsidePct: 30,
      return1yPct: 25,
      return1mPct: 8,
      maxDrawdown1yPct: -12,
      volatilityDailyPct: 1.2,
      volumeSpikeRatio: 1.1,
      analystKey: "strong_buy",
      analystMean: 1.4,
      earningsGrowth: 0.25,
      revenueGrowth: 0.18,
      trailingPe: 18,
      forwardPe: 15,
      profitMargins: 0.22,
      valuationLabel: "Undervalued",
      shortTermDirection: "Bullish",
      intermediateTermDirection: "Bullish",
      longTermDirection: "Bullish",
      insiderSentiment: 0.4,
      sectorInsiderSentiment: 0.1,
      daysToEarnings: 12,
      recentDevelopmentCount: 1,
      hasUnusualNews: false,
    });

    const weak = computeOpportunityScores({
      price: 100,
      targetPrice: 85,
      upsidePct: -15,
      return1yPct: -30,
      return1mPct: -10,
      maxDrawdown1yPct: -45,
      volatilityDailyPct: 3.5,
      volumeSpikeRatio: 3,
      analystKey: "sell",
      analystMean: 4.2,
      earningsGrowth: -0.1,
      revenueGrowth: -0.05,
      trailingPe: 55,
      forwardPe: 60,
      profitMargins: 0.05,
      valuationLabel: "Overvalued",
      shortTermDirection: "Bearish",
      intermediateTermDirection: "Bearish",
      longTermDirection: "Bearish",
      insiderSentiment: -0.2,
      sectorInsiderSentiment: 0.1,
      daysToEarnings: 90,
      recentDevelopmentCount: 0,
      hasUnusualNews: true,
    });

    expect(strong.opportunityScore).toBeGreaterThan(weak.opportunityScore);
    expect(strong.opportunityScore).toBeGreaterThanOrEqual(65);
    expect(weak.opportunityScore).toBeLessThanOrEqual(45);
    expect(strong.action).toBe("buy");
    expect(weak.riskScore).toBeGreaterThan(strong.riskScore);
    expect(strong.breakdown.valuation.score).toBeGreaterThan(60);
    expect(weak.categories).toContain("something_happening");
  });

  it("clamps component scores to 0–100", () => {
    const scored = computeOpportunityScores({
      price: 10,
      targetPrice: 50,
      upsidePct: 400,
      return1yPct: 200,
      return1mPct: 50,
      maxDrawdown1yPct: -5,
      volatilityDailyPct: 0.5,
      volumeSpikeRatio: null,
      analystKey: "strong_buy",
      analystMean: 1,
      earningsGrowth: 2,
      revenueGrowth: 2,
      trailingPe: 5,
      forwardPe: 4,
      profitMargins: 0.5,
      valuationLabel: "Undervalued",
      shortTermDirection: "Bullish",
      intermediateTermDirection: "Bullish",
      longTermDirection: "Bullish",
      insiderSentiment: 1,
      sectorInsiderSentiment: -1,
      daysToEarnings: 3,
      recentDevelopmentCount: 5,
      hasUnusualNews: true,
    });
    for (const c of Object.values(scored.breakdown)) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
    expect(scored.opportunityScore).toBeLessThanOrEqual(100);
  });
});

describe("assignCategories", () => {
  it("tags beaten_down and catalyst plays", () => {
    const cats = assignCategories({
      opportunityScore: 60,
      convictionScore: 55,
      riskScore: 50,
      upsidePct: 15,
      valuationScore: 70,
      return1yPct: -20,
      return1mPct: 2,
      maxDrawdown1yPct: -32,
      technicalsScore: 55,
      daysToEarnings: 10,
      volumeSpikeRatio: 1,
      hasUnusualNews: false,
      recentDevelopmentCount: 0,
    });
    expect(cats).toContain("beaten_down");
    expect(cats).toContain("catalyst_plays");
    expect(cats).toContain("undervalued");
  });
});

describe("simulateScenarios", () => {
  it("orders bear < base < bull implied prices when growth is positive", () => {
    const result = simulateScenarios({
      symbol: "TEST",
      currentPrice: 100,
      trailingEps: 5,
      assumptions: defaultAssumptionsFromFundamentals({
        revenueGrowth: 0.12,
        earningsGrowth: 0.12,
        profitMargins: 0.2,
        trailingPe: 20,
        forwardPe: 18,
      }),
    });
    const bear = result.bands.find((b) => b.label === "bear")!;
    const base = result.bands.find((b) => b.label === "base")!;
    const bull = result.bands.find((b) => b.label === "bull")!;
    expect(bear.impliedPrice!).toBeLessThan(base.impliedPrice!);
    expect(base.impliedPrice!).toBeLessThan(bull.impliedPrice!);
    expect(result.disclaimer).toMatch(/not forecasts/i);
  });
});

describe("findHistoricalPatterns", () => {
  it("returns empty for short series", () => {
    expect(findHistoricalPatterns([])).toEqual([]);
  });

  it("detects dip patterns in a synthetic series", () => {
    const bars: HistoryBar[] = [];
    let price = 100;
    for (let i = 0; i < 200; i++) {
      // Create periodic dips
      if (i % 40 >= 30 && i % 40 < 35) price *= 0.96;
      else price *= 1.004;
      bars.push({
        time: i,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: 1_000_000 + (i % 7 === 0 ? 3_000_000 : 0),
      });
    }
    const patterns = findHistoricalPatterns(bars);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]!.sampleSize).toBeGreaterThanOrEqual(3);
    expect(patterns[0]!.disclaimer).toMatch(/Past similar setups/i);
  });
});
