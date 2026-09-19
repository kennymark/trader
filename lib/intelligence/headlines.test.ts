import { describe, expect, it } from "vitest";
import type { HappeningEvent } from "@trader/shared";
import { applyHeadlineVerdicts, headlinesIn } from "./headlines";
import type { HeadlineVerdict } from "../newsClassifier";

function newsEvent(detail: string): HappeningEvent {
  return {
    id: `X-news-0`,
    kind: "news",
    title: "Notable development",
    detail,
    fact: `Yahoo significant development headline: ${detail}`,
    speculation: "Headline impact on fundamentals is uncertain without filing review.",
    severity: "medium",
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

const priceEvent: HappeningEvent = {
  id: "X-px-day",
  kind: "price",
  title: "Large daily move",
  detail: "Session change +8.10%.",
  fact: "Regular-session change of 8.10%.",
  speculation: null,
  severity: "high",
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const verdicts = (entries: Array<[string, HeadlineVerdict]>) => new Map(entries);

describe("headline categories", () => {
  it("names the event and ranks it by what the category tends to do", () => {
    const events = [newsEvent("Nvidia to acquire AI chip startup for $700M")];
    const [out] = applyHeadlineVerdicts(
      events,
      verdicts([
        ["Nvidia to acquire AI chip startup for $700M", { label: "takeover or merger", confidence: 0.98 }],
      ]),
    );
    expect(out!.title).toBe("Takeover or merger");
    expect(out!.severity).toBe("high");
  });

  it("demotes commentary rather than hiding it", () => {
    const events = [newsEvent("10 stocks to buy before the year ends")];
    const out = applyHeadlineVerdicts(
      events,
      verdicts([
        ["10 stocks to buy before the year ends", { label: "not company news", confidence: 0.91 }],
      ]),
    );
    // Still present: a headline you were never shown is invisible.
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("low");
    expect(out[0]!.title).toBe("Commentary");
  });

  it("says nothing when the model is unsure", () => {
    const events = [newsEvent("Apple something something")];
    const [out] = applyHeadlineVerdicts(
      events,
      verdicts([["Apple something something", { label: "earnings or results", confidence: 0.42 }]]),
    );
    expect(out!.title).toBe("Notable development");
    expect(out!.severity).toBe("medium");
  });

  it("keeps the headline and the machine's opinion of it apart", () => {
    const events = [newsEvent("Apple beats Q4 estimates")];
    const [out] = applyHeadlineVerdicts(
      events,
      verdicts([["Apple beats Q4 estimates", { label: "earnings or results", confidence: 0.99 }]]),
    );
    expect(out!.fact).toContain("Yahoo significant development headline");
    expect(out!.speculation).toContain("automatic classifier");
    expect(out!.speculation).toContain("99%");
  });

  it("leaves everything alone when the classifier said nothing", () => {
    const events = [newsEvent("Some headline"), priceEvent];
    expect(applyHeadlineVerdicts(events, new Map())).toEqual(events);
  });

  it("never touches events that are not news", () => {
    const [out] = applyHeadlineVerdicts(
      [priceEvent],
      verdicts([["Session change +8.10%.", { label: "earnings or results", confidence: 1 }]]),
    );
    expect(out).toEqual(priceEvent);
  });

  it("collects only news headlines for the batch", () => {
    expect(headlinesIn([newsEvent("A"), priceEvent, newsEvent("B")])).toEqual(["A", "B"]);
  });
});
