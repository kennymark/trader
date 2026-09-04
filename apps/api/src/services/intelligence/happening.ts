import type { HappeningEvent, HistoryBar } from "@trader/shared";

export function detectHappening(input: {
  symbol: string;
  bars: HistoryBar[];
  changePercent: number | null;
  return1mPct: number | null;
  volumeSpikeRatio: number | null;
  insiderVsSector: number | null;
  recentDevelopments: string[];
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  shortTermDirection: string | null;
  now?: Date;
}): HappeningEvent[] {
  const now = (input.now ?? new Date()).toISOString();
  const events: HappeningEvent[] = [];
  const key = input.symbol.toUpperCase();

  if (input.volumeSpikeRatio != null && input.volumeSpikeRatio >= 2.2) {
    events.push({
      id: `${key}-vol`,
      kind: "volume",
      title: "Unusual volume",
      detail: `Latest volume is ${input.volumeSpikeRatio.toFixed(1)}× the 20-day average.`,
      fact: `Volume spike ratio ${input.volumeSpikeRatio.toFixed(2)} vs 20-session average.`,
      speculation:
        "Could reflect positioning into news, short covering, or liquidity events — confirmation needed.",
      severity: input.volumeSpikeRatio >= 3.5 ? "high" : "medium",
      detectedAt: now,
    });
  }

  if (input.changePercent != null && Math.abs(input.changePercent) >= 4) {
    events.push({
      id: `${key}-px-day`,
      kind: "price",
      title: "Large daily move",
      detail: `Session change ${input.changePercent >= 0 ? "+" : ""}${input.changePercent.toFixed(2)}%.`,
      fact: `Regular-session change of ${input.changePercent.toFixed(2)}%.`,
      speculation: "Move may reverse or continue; check catalysts before acting.",
      severity: Math.abs(input.changePercent) >= 7 ? "high" : "medium",
      detectedAt: now,
    });
  }

  if (input.return1mPct != null && Math.abs(input.return1mPct) >= 12) {
    events.push({
      id: `${key}-px-1m`,
      kind: "price",
      title: input.return1mPct > 0 ? "Sharp 1M rally" : "Sharp 1M selloff",
      detail: `Approx 1-month return ${input.return1mPct >= 0 ? "+" : ""}${input.return1mPct.toFixed(1)}%.`,
      fact: `~1M total return ${input.return1mPct.toFixed(1)}% from recent history bars.`,
      speculation: null,
      severity: Math.abs(input.return1mPct) >= 20 ? "high" : "medium",
      detectedAt: now,
    });
  }

  if (input.insiderVsSector != null && Math.abs(input.insiderVsSector) >= 0.2) {
    events.push({
      id: `${key}-insider`,
      kind: "insider",
      title: "Insider sentiment diverges from sector",
      detail: `Company insider score vs sector: ${input.insiderVsSector >= 0 ? "+" : ""}${input.insiderVsSector.toFixed(2)}.`,
      fact: "Yahoo companySnapshot insiderSentiments vs sector peer reading.",
      speculation: "Insider indices are noisy and delayed; treat as a soft signal.",
      severity: "low",
      detectedAt: now,
    });
  }

  for (const [i, headline] of input.recentDevelopments.slice(0, 2).entries()) {
    events.push({
      id: `${key}-news-${i}`,
      kind: "news",
      title: "Notable development",
      detail: headline,
      fact: `Yahoo significant development headline: ${headline}`,
      speculation: "Headline impact on fundamentals is uncertain without filing review.",
      severity: "medium",
      detectedAt: now,
    });
  }

  if (
    input.earningsGrowth != null &&
    input.revenueGrowth != null &&
    input.earningsGrowth > 0.15 &&
    input.revenueGrowth < 0.02
  ) {
    events.push({
      id: `${key}-rev`,
      kind: "revision",
      title: "Earnings growth without revenue support",
      detail: "EPS growth prints strong while revenue growth is soft.",
      fact: `Earnings growth ${(input.earningsGrowth * 100).toFixed(1)}% vs revenue ${(input.revenueGrowth * 100).toFixed(1)}%.`,
      speculation: "May reflect buybacks, cost cuts, or one-offs rather than demand.",
      severity: "medium",
      detectedAt: now,
    });
  }

  if ((input.shortTermDirection || "").toLowerCase() === "bearish" && (input.return1mPct ?? 0) > 8) {
    events.push({
      id: `${key}-tech`,
      kind: "technical",
      title: "Price strength vs short-term technical caution",
      detail: "Recent gains while short-term outlook is Bearish.",
      fact: `Short-term direction ${input.shortTermDirection}; ~1M return ${input.return1mPct?.toFixed(1)}%.`,
      speculation: "Possible mean-reversion setup — not a trade signal by itself.",
      severity: "low",
      detectedAt: now,
    });
  }

  // Touch volume from bars for confirmation when ratio missing
  if (input.volumeSpikeRatio == null && input.bars.length >= 25) {
    const last = input.bars[input.bars.length - 1]!;
    const avg =
      input.bars.slice(-21, -1).reduce((s, b) => s + (b.volume || 0), 0) / 20;
    if (last.volume && avg > 0 && last.volume / avg >= 2.2) {
      events.push({
        id: `${key}-vol-bar`,
        kind: "volume",
        title: "Unusual volume",
        detail: `Last bar volume ${(last.volume / avg).toFixed(1)}× 20-day average.`,
        fact: `Computed from OHLC volume history.`,
        speculation: null,
        severity: "medium",
        detectedAt: now,
      });
    }
  }

  return events;
}

export function volumeSpikeRatio(bars: HistoryBar[]): number | null {
  if (bars.length < 25) return null;
  const last = bars[bars.length - 1]!;
  if (!last.volume) return null;
  const avg = bars.slice(-21, -1).reduce((s, b) => s + (b.volume || 0), 0) / 20;
  if (avg <= 0) return null;
  return last.volume / avg;
}

export function returnOverBars(bars: HistoryBar[], sessions: number): number | null {
  if (bars.length < sessions + 1) return null;
  const end = bars[bars.length - 1]!.close;
  const start = bars[bars.length - 1 - sessions]!.close;
  if (start <= 0) return null;
  return ((end - start) / start) * 100;
}
