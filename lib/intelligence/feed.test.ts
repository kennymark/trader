import { describe, expect, it } from "vitest";
import type { OpportunityCard } from "@trader/shared";
import { buildFeed } from "../intelligence";

function card(overrides: Partial<OpportunityCard> = {}): OpportunityCard {
  return {
    symbol: "NVDA",
    displayName: "NVIDIA",
    price: 100,
    marketCap: 1_000,
    changePercent: 1,
    opportunityScore: 80,
    riskScore: 40,
    convictionScore: 70,
    potentialUpsidePct: 22.4,
    keyReason: "Analyst target well above the price",
    upcomingCatalyst: null,
    categories: [],
    breakdown: {} as OpportunityCard["breakdown"],
    action: "buy",
    confidence: 72,
    score: 0.6,
    targetPrice: 130,
    upsidePct: 30,
    analystRating: "buy",
    analystCount: 40,
    return1yPct: 25,
    maxDrawdown1yPct: -8,
    volatilityDailyPct: 1.2,
    timing: "now",
    rationale: "BUY NVDA: momentum plus a wide analyst gap",
    signals: [
      { label: "Momentum", value: "+25% over a year", bias: "buy" },
      { label: "Valuation", value: "Forward PE 15", bias: "buy" },
      { label: "Volatility", value: "1.2% daily", bias: "sell" },
    ],
    happening: [],
    lastAnalysedAt: new Date().toISOString(),
    ...overrides,
  } as OpportunityCard;
}

describe("buildFeed", () => {
  it("leads with the call and carries the reasons behind it", () => {
    const [item] = buildFeed([card()], []);
    expect(item.action).toBe("buy");
    expect(item.title).toBe("Buy NVDA");
    expect(item.body).toContain("momentum");
    expect(item.confidence).toBe(72);
    expect(item.reasons).toContain("Momentum: +25% over a year");
    expect(item.reasons).toContain("Analysts see ~22% upside");
  });

  it("names what would make the call wrong, from the signal that leans the other way", () => {
    const [item] = buildFeed([card()], []);
    expect(item.risk).toBe("Volatility: 1.2% daily");
  });

  it("only cites reasons that agree with the call", () => {
    const [item] = buildFeed([card({ action: "sell" })], []);
    expect(item.title).toBe("Sell NVDA");
    expect(item.reasons).toContain("Volatility: 1.2% daily");
    expect(item.reasons).not.toContain("Momentum: +25% over a year");
  });

  it("falls back to the drawdown when every signal agrees", () => {
    const item = buildFeed(
      [
        card({
          signals: [{ label: "Momentum", value: "+25%", bias: "buy" }],
          maxDrawdown1yPct: -32,
        }),
      ],
      [],
    )[0];
    expect(item.risk).toBe("Fell 32% at its worst over the last year");
  });

  it("gives an event the standing call, so news is never advice-free", () => {
    const items = buildFeed(
      [
        card({
          happening: [
            {
              id: "h1",
              kind: "news",
              title: "Guidance raised",
              fact: "Q4 revenue guided above consensus",
              detail: "",
              severity: "high",
              detectedAt: new Date().toISOString(),
            } as OpportunityCard["happening"][number],
          ],
        }),
      ],
      [],
    );
    const happening = items.find((i) => i.kind === "happening");
    expect(happening?.action).toBe("buy");
    expect(happening?.reasons?.[0]).toContain("Standing call: Buy");
  });
});
