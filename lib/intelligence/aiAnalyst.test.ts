import { describe, expect, it } from "vitest";
import { parseLooseJson, salvageRationales } from "./aiAnalyst";

describe("parseLooseJson", () => {
  it("parses well-formed JSON wrapped in prose", () => {
    const parsed = parseLooseJson<{ items: Array<{ symbol: string }> }>(
      'Here you go:\n```json\n{"items":[{"symbol":"AAPL"}]}\n```',
    );
    expect(parsed?.items[0].symbol).toBe("AAPL");
  });

  it("repairs a response truncated mid-string", () => {
    const parsed = parseLooseJson<{ items: Array<{ symbol: string; rationale: string }> }>(
      '{"items":[{"symbol":"AAPL","rationale":"Buy on margin expansion"},{"symbol":"MSFT","rationale":"Cloud growth still comp',
    );
    expect(parsed?.items).toHaveLength(2);
    expect(parsed?.items[1].symbol).toBe("MSFT");
  });

  it("repairs a response truncated between items", () => {
    const parsed = parseLooseJson<{ items: Array<{ symbol: string }> }>(
      '{"items":[{"symbol":"AAPL","rationale":"x"},',
    );
    expect(parsed?.items).toHaveLength(1);
  });

  it("returns null on unrecoverable text", () => {
    expect(parseLooseJson("no json here at all")).toBeNull();
  });
});

describe("salvageRationales", () => {
  it("recovers pairs from JSON broken by an unescaped quote", () => {
    const items = salvageRationales(
      '{"items":[{"symbol":"AAPL","rationale":"The "cheap" multiple holds"},{"symbol":"MSFT","rationale":"Cloud growth"}]}',
    );
    expect(items.map((i) => i.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(items[1].rationale).toBe("Cloud growth");
  });
});
