import type { HappeningEvent } from "@trader/shared";
import {
  MIN_CONFIDENCE,
  type HeadlineLabel,
  type HeadlineVerdict,
} from "../newsClassifier";

/**
 * How a classified headline is presented.
 *
 * Severity is what orders the feed, so it encodes how much a category tends to
 * move a holding rather than how interesting it reads. A rating change is a
 * broker's opinion and sits low; a takeover is the company being sold.
 */
const PRESENTATION: Record<HeadlineLabel, { title: string; severity: HappeningEvent["severity"] }> =
  {
    "earnings or results": { title: "Results", severity: "high" },
    "takeover or merger": { title: "Takeover or merger", severity: "high" },
    "regulatory or legal": { title: "Regulatory or legal", severity: "high" },
    "guidance or outlook change": { title: "Guidance changed", severity: "high" },
    "product or launch": { title: "Product news", severity: "medium" },
    "leadership change": { title: "Leadership change", severity: "medium" },
    // Raising money dilutes or leverages the holding, so it is not background.
    "financing or share issue": { title: "Financing", severity: "medium" },
    "analyst rating change": { title: "Analyst rating change", severity: "low" },
    "market-wide or macro": { title: "Market-wide news", severity: "low" },
    "not company news": { title: "Commentary", severity: "low" },
  };

/**
 * Rewrites the title and severity of news events whose headline the classifier
 * was confident about, and leaves every other event exactly as it was.
 *
 * A low-confidence answer is discarded rather than shown, because a wrong
 * category on a financial feed is worse than a generic one. Nothing is ever
 * dropped: an unread headline you were not shown is invisible, so the feed
 * demotes noise instead of hiding it.
 */
export function applyHeadlineVerdicts(
  events: HappeningEvent[],
  verdicts: Map<string, HeadlineVerdict>,
): HappeningEvent[] {
  if (verdicts.size === 0) return events;

  return events.map((event) => {
    if (event.kind !== "news") return event;
    const verdict = verdicts.get(event.detail.trim());
    if (!verdict || verdict.confidence < MIN_CONFIDENCE) return event;

    const shape = PRESENTATION[verdict.label];
    if (!shape) return event;

    return {
      ...event,
      title: shape.title,
      severity: shape.severity,
      // The headline is Yahoo's; the category is a model's read of it, and the
      // feed should not blur which is which.
      speculation: `Categorised as ${verdict.label} with ${Math.round(
        verdict.confidence * 100,
      )}% confidence by an automatic classifier, not by reading the filing.`,
    };
  });
}

/** Every distinct headline across a set of events, for one batched call. */
export function headlinesIn(events: HappeningEvent[]): string[] {
  return events.filter((e) => e.kind === "news").map((e) => e.detail.trim()).filter(Boolean);
}
