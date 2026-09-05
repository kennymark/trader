import type { AlertRule } from "@trader/shared";

const BASELINE_WORDS: Record<string, string> = {
  prev_close: "the previous close",
  n_day_high: "the recent high",
  absolute: "the price",
};

/** What the rule watches, as a noun phrase. */
export function describeScope(
  rule: Pick<AlertRule, "scope" | "symbol">,
): string {
  if (rule.scope === "watchlist") return "Every stock on your watchlist";
  if (rule.scope === "holdings") return "Every stock you hold";
  return rule.symbol || "A stock";
}

/**
 * A rule read as a sentence. `pct_drop 8%` is the stored shape, not something
 * anyone should have to decode on screen.
 */
export function describeRule(rule: Pick<
  AlertRule,
  "kind" | "threshold" | "baseline" | "baselineWindowDays"
>): string {
  const n = rule.threshold;
  switch (rule.kind) {
    case "above":
      return `Rises above ${n}`;
    case "below":
      return `Falls below ${n}`;
    case "pct_rise":
    case "pct_drop": {
      const dir = rule.kind === "pct_rise" ? "up" : "down";
      const base =
        rule.baseline === "n_day_high" && rule.baselineWindowDays
          ? `its ${rule.baselineWindowDays}-day high`
          : BASELINE_WORDS[rule.baseline] || "the previous close";
      return `Moves ${n}% ${dir} from ${base}`;
    }
    default:
      return `${rule.kind} ${n}`;
  }
}

/** The quiet period and delivery count, as a second line under the sentence. */
export function describeRuleDetail(rule: Pick<AlertRule, "cooldownMinutes" | "channelIds">): string {
  const count = rule.channelIds.length;
  const cooldown =
    rule.cooldownMinutes >= 60
      ? `${Math.round(rule.cooldownMinutes / 60)}h`
      : `${rule.cooldownMinutes}m`;
  const beyond = count === 0 ? "in app only" : `in app + ${count} ${count === 1 ? "destination" : "destinations"}`;
  return `Quiet for ${cooldown} after firing · ${beyond}`;
}
