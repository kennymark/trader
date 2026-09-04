import { afterEach, describe, expect, it } from "vitest";
import { CHAT_TOOLS, CHAT_TOOLS_BY_NAME, runChatTool } from "./chatTools";

describe("tool definitions", () => {
  it("gives every tool a schema both providers can send", () => {
    for (const tool of CHAT_TOOLS) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters.type).toBe("object");
      // Strict schemas: an undeclared field should be rejected, and every
      // required name must actually exist in properties.
      expect(tool.parameters.additionalProperties).toBe(false);
      for (const key of tool.parameters.required) {
        expect(Object.keys(tool.parameters.properties)).toContain(key);
      }
    }
  });

  it("exposes a lookup for the ticker of a named company", () => {
    expect(CHAT_TOOLS_BY_NAME.has("search_symbols")).toBe(true);
    expect(CHAT_TOOLS_BY_NAME.has("get_quote")).toBe(true);
  });
});

describe("runChatTool", () => {
  const original = new Map(CHAT_TOOLS.map((t) => [t.name, t.run]));

  afterEach(() => {
    for (const tool of CHAT_TOOLS) tool.run = original.get(tool.name)!;
  });

  it("reports an unknown tool instead of throwing", async () => {
    await expect(runChatTool("no_such_tool", {})).resolves.toContain("No such tool");
  });

  it("turns a failed lookup into something the model can read", async () => {
    const quote = CHAT_TOOLS_BY_NAME.get("get_quote")!;
    quote.run = async () => {
      throw new Error("upstream is down");
    };
    // A dead data source should make the assistant say so, not end the turn.
    await expect(runChatTool("get_quote", { symbols: ["MRNA"] })).resolves.toBe(
      "Lookup failed: upstream is down",
    );
  });

  it("passes arguments through to the tool", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const quote = CHAT_TOOLS_BY_NAME.get("get_quote")!;
    quote.run = async (args) => {
      seen.push(args);
      return "ok";
    };
    await runChatTool("get_quote", { symbols: ["mrna"] });
    expect(seen).toEqual([{ symbols: ["mrna"] }]);
  });
});
