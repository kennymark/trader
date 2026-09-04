import type {
  AlertEvent,
  OpportunityCard,
  PortfolioHolding,
  PortfolioPerformance,
} from "@trader/shared";

/**
 * Everything the assistant is allowed to know, assembled from the same
 * computations the screens use. The model gets a digest rather than raw rows:
 * a portfolio of a few hundred trades would otherwise cost more to send than
 * the answer is worth, and the numbers the user asks about are the derived
 * ones anyway.
 */
export type ChatContext = {
  currency: string;
  performance: PortfolioPerformance | null;
  holdings: PortfolioHolding[];
  watchlist: Array<{ symbol: string; displayName: string | null; score: number | null }>;
  alerts: AlertEvent[];
  opportunities: OpportunityCard[];
  asOf: string;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** How many rows of each kind survive into the prompt. */
const LIMITS = { positions: 40, closed: 25, watchlist: 40, alerts: 15, opportunities: 12 };

function money(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(value).toFixed(2)}`;
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return `## ${title}\nNothing recorded.`;
  return `## ${title}\n${lines.join("\n")}`;
}

function headline(perf: PortfolioPerformance, currency: string): string {
  return [
    `Realised P&L: ${money(perf.realizedPnl, currency)} (profit ${money(perf.realizedProfit, currency)}, loss ${money(perf.realizedLoss, currency)})`,
    `Unrealised P&L: ${money(perf.unrealizedPnl, currency)}`,
    `Total P&L: ${money(perf.totalPnl, currency)}`,
    `Invested ${money(perf.invested, currency)}; proceeds ${money(perf.proceeds, currency)}; dividends ${money(perf.dividends, currency)}; fees ${money(perf.fees, currency)}`,
    `Deposits ${money(perf.deposits, currency)}; withdrawals ${money(perf.withdrawals, currency)}; interest ${money(perf.interest, currency)}`,
    `Positions: ${perf.openCount} open, ${perf.closedCount} closed, ${perf.symbolCount} distinct`,
    `Win rate: ${pct(perf.winRatePct)} across ${perf.winCount} winners and ${perf.lossCount} losers`,
    perf.best ? `Best: ${perf.best.symbol} ${money(perf.best.pnl, currency)}` : null,
    perf.worst ? `Worst: ${perf.worst.symbol} ${money(perf.worst.pnl, currency)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function positionLine(
  p: PortfolioPerformance["positions"][number],
  currency: string,
): string {
  const held = p.status === "open" ? `${p.quantityHeld} held` : "closed";
  return [
    `- ${p.symbol}${p.displayName ? ` (${p.displayName})` : ""}: ${held}`,
    `avg cost ${money(p.averageCost, currency)}`,
    `mark ${money(p.price, currency)}`,
    `value ${money(p.marketValue, currency)}`,
    `realised ${money(p.realizedPnl, currency)}`,
    `unrealised ${money(p.unrealizedPnl, currency)}`,
    `total ${money(p.totalPnl, currency)} (${pct(p.returnPct)})`,
    p.firstBoughtAt ? `first bought ${p.firstBoughtAt.slice(0, 10)}` : null,
    p.holdDays != null ? `held ${p.holdDays}d` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Sorted by absolute P&L so a truncated list still contains the positions
 * worth asking about, rather than whichever ones happen to sort first.
 */
function byImpact<T extends { totalPnl: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Math.abs(b.totalPnl) - Math.abs(a.totalPnl));
}

export function buildPortfolioBrief(ctx: ChatContext): string {
  const currency = ctx.currency;
  const blocks: string[] = [`Portfolio as of ${ctx.asOf}. All figures in ${currency}.`];

  if (!ctx.performance) {
    blocks.push(
      "## Portfolio\nNo broker data imported yet. The user can import a Freetrade CSV from Settings.",
    );
  } else {
    const perf = ctx.performance;
    blocks.push(`## Headline\n${headline(perf, currency)}`);

    const open = byImpact(perf.positions.filter((p) => p.status === "open"));
    const closed = byImpact(perf.positions.filter((p) => p.status === "closed"));

    blocks.push(
      section(
        `Open positions (${open.length})`,
        open.slice(0, LIMITS.positions).map((p) => positionLine(p, currency)),
      ),
    );
    blocks.push(
      section(
        `Closed positions (${closed.length})`,
        closed.slice(0, LIMITS.closed).map((p) => positionLine(p, currency)),
      ),
    );

    if (perf.insights.length > 0) {
      blocks.push(
        section(
          "Insights already shown to the user",
          perf.insights.map((i) => `- ${i.title}: ${i.detail}`),
        ),
      );
    }

    const months = perf.series.slice(-24);
    if (months.length > 0) {
      blocks.push(
        section(
          "Monthly P&L (last 24 months)",
          months.map((m) => `- ${m.month}: ${money(m.pnl, currency)} (cumulative ${money(m.cumulative, currency)})`),
        ),
      );
    }
  }

  // Live marks come from the holdings table, which the performance action does
  // not always have when quotes fail; keep both so a gap in one still answers.
  blocks.push(
    section(
      `Current holdings (${ctx.holdings.length})`,
      ctx.holdings
        .slice(0, LIMITS.positions)
        .map(
          (h) =>
            `- ${h.symbol}: ${h.quantity} @ avg ${money(h.averageCost, h.currency)}, value ${money(h.marketValue, h.currency)}, unrealised ${money(h.unrealizedPnl, h.currency)}${h.weightPct != null ? `, ${h.weightPct.toFixed(1)}% of book` : ""}`,
        ),
    ),
  );

  blocks.push(
    section(
      `Watchlist (${ctx.watchlist.length})`,
      ctx.watchlist
        .slice(0, LIMITS.watchlist)
        .map(
          (w) =>
            `- ${w.symbol}${w.displayName ? ` (${w.displayName})` : ""}${w.score != null ? `, opportunity score ${w.score}` : ""}`,
        ),
    ),
  );

  blocks.push(
    section(
      "Opportunity scoring (The Hunt)",
      ctx.opportunities
        .slice(0, LIMITS.opportunities)
        .map(
          (o) =>
            `- ${o.symbol}: opportunity ${o.opportunityScore}, risk ${o.riskScore}, conviction ${o.convictionScore}, action ${o.action}, upside ${pct(o.potentialUpsidePct)} — ${o.keyReason}${o.upcomingCatalyst ? ` (next: ${o.upcomingCatalyst})` : ""}`,
        ),
    ),
  );

  blocks.push(
    section(
      "Recent alerts",
      ctx.alerts
        .slice(0, LIMITS.alerts)
        .map((a) => `- ${a.createdAt.slice(0, 16).replace("T", " ")} ${a.symbol}: ${a.message}`),
    ),
  );

  return blocks.join("\n\n");
}

export const SYSTEM_PREAMBLE = `You are the analyst inside this person's own trading terminal. Two things are in front of you: their whole book — every position, realised and unrealised P&L, their watchlist, the opportunity scores and recent alerts — and a set of tools that read live market data for any listed company, whether or not they own it.

Answer both kinds of question:
- About their book, from the brief below. Those figures are computed from their own broker records and are what the screens show, so quote them exactly rather than re-deriving or rounding away detail.
- About the market — a price, a valuation, how something has moved, when a company reports — by calling a tool. Do not answer a question about current prices from memory: your training data is old and the brief only covers their own holdings. Look it up.

Using the tools:
- When the user names a company rather than a ticker, search for the ticker first. Never guess one.
- Call several tools at once when a question needs several facts.
- If a lookup fails or returns nothing, say so plainly. Never fill the gap with a remembered number.

Style:
- Be concrete and short. Lead with the answer, then the figures that support it. No preamble, no restating the question.
- Say when a figure is live and when it is the user's own cost or P&L, so the two are never confused.
- Their portfolio is in its own currency; a quote is in the currency the tool reports. Do not convert unless asked, and name the currency when they differ.
- You are not a licensed adviser. You can describe what the numbers show, what a position has done, and what the scoring says. Do not tell the user to buy or sell, and do not predict prices.`;

export function buildSystemPrompt(ctx: ChatContext): string {
  return `${SYSTEM_PREAMBLE}\n\n---\n\n${buildPortfolioBrief(ctx)}`;
}
