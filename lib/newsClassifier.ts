/**
 * Headlines arrive from Yahoo as bare strings with nothing saying what kind of
 * event they report, so every one of them used to be posted as "Notable
 * development" at medium severity. A takeover and a listicle read identically.
 *
 * classifier.dev sorts them into the categories below in one keyless call. It
 * is a decision model rather than a prompted LLM, so each answer carries a
 * calibrated probability, and an answer we are not sure of is left alone
 * instead of being asserted.
 *
 * This is decoration on top of a fact. The headline itself is what Yahoo said;
 * the category is this service's opinion of it, and the code keeps the two
 * apart. Nothing here is allowed to fail an intelligence run: the network is
 * optional and every path returns "no opinion" rather than throwing.
 */

/** Named in words, because the labels are read semantically. */
export const HEADLINE_LABELS = [
  "earnings or results",
  "takeover or merger",
  "regulatory or legal",
  "guidance or outlook change",
  "analyst rating change",
  "product or launch",
  "leadership change",
  "financing or share issue",
  "market-wide or macro",
  "not company news",
] as const;

export type HeadlineLabel = (typeof HEADLINE_LABELS)[number];

export type HeadlineVerdict = {
  label: HeadlineLabel;
  confidence: number;
};

const ENDPOINT = "https://classifier.dev";
/** Below this the model is barely better than a guess, so we say nothing. */
export const MIN_CONFIDENCE = 0.7;
const TIMEOUT_MS = 4000;
const MAX_BATCH = 1000;

function enabled(): boolean {
  // Opt out for offline work or if the service ever misbehaves.
  return (process.env.NEWS_CLASSIFIER ?? "").trim().toLowerCase() !== "off";
}

const INSTRUCTIONS =
  "Classify a stock market news headline by the kind of company event it reports. " +
  "Generic market commentary, opinion pieces, listicles and promotional roundups are not company news.";

/**
 * Returns a verdict per headline, keyed by the headline text. Headlines the
 * service could not answer for are simply absent from the map.
 */
/**
 * A headline's category does not change, and the same ones are asked about
 * repeatedly: the detail page requests its numbers and its analysis
 * separately, and both classify the same list. Remembering the answers keeps
 * that to one call.
 */
const VERDICTS = new Map<string, { at: number; verdict: HeadlineVerdict }>();
const VERDICT_TTL_MS = 60 * 60_000;

export async function classifyHeadlines(
  headlines: string[],
): Promise<Map<string, HeadlineVerdict>> {
  const out = new Map<string, HeadlineVerdict>();
  const all = [...new Set(headlines.map((h) => h.trim()).filter(Boolean))];

  const now = Date.now();
  const unique: string[] = [];
  for (const headline of all) {
    const hit = VERDICTS.get(headline);
    if (hit && now - hit.at < VERDICT_TTL_MS) out.set(headline, hit.verdict);
    else unique.push(headline);
  }
  if (!unique.length || !enabled()) return out;

  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    const batch = unique.slice(i, i + MAX_BATCH);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Some clients' defaults are blocked at the edge; be explicit.
          "user-agent": "trader-intelligence/1.0",
        },
        body: JSON.stringify({
          labels: HEADLINE_LABELS,
          inputs: batch,
          instructions: INSTRUCTIONS,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`Headline classifier returned ${res.status}`);
        continue;
      }
      const body = (await res.json()) as {
        results?: Array<{ label?: string; confidence?: number | null }>;
      };
      const results = body.results ?? [];
      // Results come back in input order.
      batch.forEach((headline, index) => {
        const r = results[index];
        const label = r?.label as HeadlineLabel | undefined;
        const confidence = r?.confidence;
        if (!label || typeof confidence !== "number") return;
        if (!HEADLINE_LABELS.includes(label)) return;
        const verdict = { label, confidence };
        VERDICTS.set(headline, { at: Date.now(), verdict });
        out.set(headline, verdict);
      });
    } catch (err) {
      // Timeout, offline, rate limit: the feed is still correct without this.
      console.error("Headline classifier unavailable", err);
    } finally {
      clearTimeout(timer);
    }
  }

  return out;
}
