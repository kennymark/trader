import type { HistoricalPatternMatch, HistoryBar } from "@trader/shared";

const DISCLAIMER =
  "Historical analogies are descriptive only. Past similar setups do not guarantee future results; sample sizes are limited.";

function pctChange(from: number, to: number) {
  return ((to - from) / from) * 100;
}

/**
 * Find similar historical setups in the same symbol's price history
 * (dip + bounce, breakout, volume spike) and summarize outcomes.
 */
export function findHistoricalPatterns(
  bars: HistoryBar[],
  lookbackDays = 252,
): HistoricalPatternMatch[] {
  if (bars.length < 60) return [];

  const window = bars.slice(-Math.min(bars.length, lookbackDays + 60));
  const matches: HistoricalPatternMatch[] = [];

  // Pattern: ≥10% dip over ~10 sessions, then 20-session forward return
  const dipOutcomes: number[] = [];
  const dipDays: number[] = [];
  for (let i = 15; i < window.length - 25; i++) {
    const start = window[i - 10]!.close;
    const trough = window[i]!.close;
    if (start <= 0) continue;
    const dip = pctChange(start, trough);
    if (dip <= -10) {
      const forward = window[i + 20]!.close;
      dipOutcomes.push(pctChange(trough, forward));
      dipDays.push(20);
    }
  }
  if (dipOutcomes.length >= 3) {
    const wins = dipOutcomes.filter((r) => r > 0).length;
    matches.push({
      patternId: "dip_10pct",
      label: "10%+ pullback",
      description:
        "Episodes where price fell ≥10% over ~10 sessions; forward 20-session return measured from the trough.",
      sampleSize: dipOutcomes.length,
      avgReturnPct: avg(dipOutcomes),
      winRatePct: (wins / dipOutcomes.length) * 100,
      medianDaysHeld: 20,
      disclaimer: DISCLAIMER,
    });
  }

  // Pattern: 20-day breakout above prior 60-day high
  const breakoutOutcomes: number[] = [];
  for (let i = 60; i < window.length - 25; i++) {
    const priorHigh = Math.max(...window.slice(i - 60, i).map((b) => b.high));
    const close = window[i]!.close;
    if (close > priorHigh * 1.01) {
      const forward = window[i + 20]!.close;
      breakoutOutcomes.push(pctChange(close, forward));
    }
  }
  if (breakoutOutcomes.length >= 3) {
    const wins = breakoutOutcomes.filter((r) => r > 0).length;
    matches.push({
      patternId: "breakout_60d",
      label: "60-day breakout",
      description:
        "Closes above the prior 60-session high by >1%; forward 20-session return from breakout day.",
      sampleSize: breakoutOutcomes.length,
      avgReturnPct: avg(breakoutOutcomes),
      winRatePct: (wins / breakoutOutcomes.length) * 100,
      medianDaysHeld: 20,
      disclaimer: DISCLAIMER,
    });
  }

  // Pattern: volume spike (≥2.5× 20d avg) with price move
  const volOutcomes: number[] = [];
  for (let i = 20; i < window.length - 15; i++) {
    const vol = window[i]!.volume;
    if (vol == null || vol <= 0) continue;
    const avgVol =
      window.slice(i - 20, i).reduce((s, b) => s + (b.volume || 0), 0) / 20;
    if (avgVol <= 0 || vol < avgVol * 2.5) continue;
    const forward = window[i + 10]!.close;
    volOutcomes.push(pctChange(window[i]!.close, forward));
  }
  if (volOutcomes.length >= 3) {
    const wins = volOutcomes.filter((r) => r > 0).length;
    matches.push({
      patternId: "volume_spike",
      label: "Volume spike (≥2.5×)",
      description:
        "Sessions with volume ≥2.5× the prior 20-session average; forward 10-session return.",
      sampleSize: volOutcomes.length,
      avgReturnPct: avg(volOutcomes),
      winRatePct: (wins / volOutcomes.length) * 100,
      medianDaysHeld: 10,
      disclaimer: DISCLAIMER,
    });
  }

  return matches;
}

function avg(xs: number[]) {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}
