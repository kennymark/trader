import type { AnalyticsResult, HistoryBar, HistoryRange } from "@trader/shared";

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function dailyReturns(bars: HistoryBar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.close;
    const curr = bars[i]!.close;
    if (prev > 0) out.push(((curr - prev) / prev) * 100);
  }
  return out;
}

function maxDrawdownPct(bars: HistoryBar[]): number | null {
  if (bars.length === 0) return null;
  let peak = bars[0]!.close;
  let maxDd = 0;
  for (const bar of bars) {
    peak = Math.max(peak, bar.close);
    if (peak > 0) {
      const dd = ((bar.close - peak) / peak) * 100;
      maxDd = Math.min(maxDd, dd);
    }
  }
  return maxDd;
}

function dipRecovery(bars: HistoryBar[], dipPct: number) {
  const events: { bouncePct: number; days: number | null }[] = [];
  let i = 1;
  while (i < bars.length) {
    const prev = bars[i - 1]!.close;
    const curr = bars[i]!.close;
    if (prev > 0) {
      const drop = ((curr - prev) / prev) * 100;
      if (drop <= -dipPct) {
        const trough = curr;
        let recoveredAt: number | null = null;
        let peakAfter = trough;
        for (let j = i + 1; j < bars.length; j++) {
          peakAfter = Math.max(peakAfter, bars[j]!.close);
          if (bars[j]!.close >= prev) {
            recoveredAt = j;
            break;
          }
        }
        const bouncePct = trough > 0 ? ((peakAfter - trough) / trough) * 100 : 0;
        const days =
          recoveredAt != null
            ? Math.round((bars[recoveredAt]!.time - bars[i]!.time) / 86400)
            : null;
        events.push({ bouncePct, days });
        i = recoveredAt ?? i + 1;
        continue;
      }
    }
    i++;
  }

  const bounceValues = events.map((e) => e.bouncePct);
  const dayValues = events.map((e) => e.days).filter((d): d is number => d != null);

  return {
    dipPct,
    eventCount: events.length,
    avgBouncePct: mean(bounceValues),
    avgDaysToRecovery: mean(dayValues),
  };
}

export function computeAnalytics(
  symbol: string,
  range: HistoryRange,
  bars: HistoryBar[],
  amount: number,
  dipPct: number,
): AnalyticsResult {
  const returns = dailyReturns(bars);
  const startPrice = bars[0]?.close ?? null;
  const endPrice = bars[bars.length - 1]?.close ?? null;
  const totalReturnPct =
    startPrice && endPrice ? ((endPrice - startPrice) / startPrice) * 100 : null;

  const endingValue =
    startPrice && endPrice && startPrice > 0 ? amount * (endPrice / startPrice) : null;
  const profit = endingValue != null ? endingValue - amount : null;
  const profitPct = profit != null ? (profit / amount) * 100 : null;

  return {
    symbol,
    range,
    barCount: bars.length,
    startPrice,
    endPrice,
    totalReturnPct,
    avgDailyReturnPct: mean(returns),
    avgWeeklyReturnPct: mean(returns) != null ? mean(returns)! * 5 : null,
    avgMonthlyReturnPct: mean(returns) != null ? mean(returns)! * 21 : null,
    volatilityDailyPct: stdev(returns),
    maxDrawdownPct: maxDrawdownPct(bars),
    dipRecovery: dipRecovery(bars, dipPct),
    whatIf: {
      amount,
      endingValue,
      profit,
      profitPct,
    },
  };
}
