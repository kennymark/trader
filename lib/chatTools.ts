import type { HistoryRange } from "@trader/shared";
import {
  getCalendar,
  getFundamentals,
  getHistory,
  getQuotes,
  searchSymbols,
} from "./yahoo";

/**
 * A tool the assistant can call, described once and mapped to whichever
 * provider is configured. `run` returns text: the model reads prose better
 * than it reads a wire format, and a short line per fact keeps the loop cheap.
 */
export type ChatTool = {
  name: string;
  description: string;
  /** JSON Schema, used verbatim by both providers. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  run: (args: Record<string, unknown>) => Promise<string>;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function symbolList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((v) => str(v).toUpperCase())
    .filter(Boolean)
    .slice(0, 10);
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "unknown";
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const RANGES: HistoryRange[] = ["1d", "7d", "1m", "3m", "1y", "5y", "max"];

export const CHAT_TOOLS: ChatTool[] = [
  {
    name: "search_symbols",
    description:
      "Find the ticker for a company by name. Use this first whenever the user names a company rather than a ticker, and never guess a ticker yourself.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company or ticker to search for, e.g. 'Moderna'" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: async (args) => {
      const query = str(args.query);
      if (!query) return "No query given.";
      const results = await searchSymbols(query, 8);
      if (results.length === 0) return `No listing found for "${query}".`;
      return results
        .map(
          (r) =>
            `${r.symbol} — ${r.name}${r.exchange ? ` (${r.exchange}${r.type ? `, ${r.type}` : ""})` : ""}`,
        )
        .join("\n");
    },
  },
  {
    name: "get_quote",
    description:
      "Current price and day change for one or more tickers. This is the live market, not the user's portfolio — use it for any question about what something is trading at now.",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Tickers, e.g. ['MRNA', 'NVDA']. Up to 10.",
        },
      },
      required: ["symbols"],
      additionalProperties: false,
    },
    run: async (args) => {
      const symbols = symbolList(args.symbols);
      if (symbols.length === 0) return "No symbols given.";
      const quotes = await getQuotes(symbols);
      if (quotes.length === 0) return `No quote available for ${symbols.join(", ")}.`;
      return quotes
        .map((q) => {
          const cur = q.currency || "";
          const chg =
            q.changePercent == null
              ? "change unknown"
              : `${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}% on the day`;
          return `${q.symbol}${q.shortName ? ` (${q.shortName})` : ""}: ${num(q.price)} ${cur}, ${chg}. Previous close ${num(q.previousClose)}${
            q.marketCap ? `. Market cap ${num(q.marketCap, 0)} ${cur}` : ""
          }`;
        })
        .join("\n");
    },
  },
  {
    name: "get_price_history",
    description:
      "How a ticker's price has moved over a period. Returns the start and end close, the move, and the high and low.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, e.g. 'MRNA'" },
        range: {
          type: "string",
          enum: RANGES,
          description: "Period to cover. Defaults to 1y.",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (args) => {
      const symbol = str(args.symbol).toUpperCase();
      if (!symbol) return "No symbol given.";
      const requested = str(args.range) as HistoryRange;
      const range = RANGES.includes(requested) ? requested : "1y";
      const bars = await getHistory(symbol, range);
      if (bars.length === 0) return `No history available for ${symbol} over ${range}.`;
      const first = bars[0]!;
      const last = bars[bars.length - 1]!;
      const closes = bars.map((b) => b.close);
      const move =
        first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;
      const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
      return [
        `${symbol} over ${range} (${bars.length} sessions, ${day(first.time)} to ${day(last.time)}):`,
        `start ${num(first.close)}, end ${num(last.close)}`,
        `move ${move == null ? "unknown" : `${move >= 0 ? "+" : ""}${move.toFixed(2)}%`}`,
        `high ${num(Math.max(...closes))}, low ${num(Math.min(...closes))}`,
      ].join("\n");
    },
  },
  {
    name: "get_fundamentals",
    description:
      "Valuation and margin figures for a ticker: P/E, forward P/E, PEG, EPS, margins, EV/EBITDA.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker, e.g. 'MRNA'" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (args) => {
      const symbol = str(args.symbol).toUpperCase();
      if (!symbol) return "No symbol given.";
      const f = await getFundamentals(symbol);
      const pct = (v: number | null) => (v == null ? "unknown" : `${(v * 100).toFixed(1)}%`);
      return [
        `${symbol}${f.shortName ? ` (${f.shortName})` : ""} fundamentals:`,
        `trailing P/E ${num(f.trailingPe)}, forward P/E ${num(f.forwardPe)}, PEG ${num(f.pegRatio)}`,
        `trailing EPS ${num(f.trailingEps)}, forward EPS ${num(f.forwardEps)}`,
        `profit margin ${pct(f.profitMargins)}, operating margin ${pct(f.operatingMargins)}, EBITDA margin ${pct(f.ebitdaMargins)}`,
        `EV/EBITDA ${num(f.enterpriseToEbitda)}`,
      ].join("\n");
    },
  },
  {
    name: "get_calendar",
    description: "Next earnings date, ex-dividend date and dividend pay date for a ticker.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker, e.g. 'MRNA'" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (args) => {
      const symbol = str(args.symbol).toUpperCase();
      if (!symbol) return "No symbol given.";
      const c = await getCalendar(symbol);
      return [
        `${symbol} dates:`,
        `earnings ${c.earningsDate ? c.earningsDate.slice(0, 10) : "not scheduled"}`,
        `ex-dividend ${c.exDividendDate ? c.exDividendDate.slice(0, 10) : "none"}`,
        `dividend paid ${c.dividendDate ? c.dividendDate.slice(0, 10) : "none"}`,
      ].join("\n");
    },
  },
];

export const CHAT_TOOLS_BY_NAME = new Map(CHAT_TOOLS.map((t) => [t.name, t]));

/** Runs a tool by name, turning a failure into something the model can read. */
export async function runChatTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = CHAT_TOOLS_BY_NAME.get(name);
  if (!tool) return `No such tool: ${name}`;
  try {
    return await tool.run(args);
  } catch (err) {
    // A dead upstream should make the model say so, not end the turn.
    return `Lookup failed: ${(err as Error).message}`;
  }
}
