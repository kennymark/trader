import type {
  AiStockAnalysis,
  AnalystVerdict,
  MarketExpectations,
  OpportunityCard,
} from "@trader/shared";
import { deepseekChat, isDeepSeekEnabled } from "../deepseek";

function verdictFromScores(card: OpportunityCard): AnalystVerdict {
  if (card.opportunityScore >= 78 && card.convictionScore >= 65 && card.riskScore < 60) {
    return "strong_opportunity";
  }
  if (card.opportunityScore >= 65) return "attractive";
  if (card.opportunityScore <= 35 || (card.opportunityScore < 45 && card.riskScore > 70)) {
    return "avoid";
  }
  if (card.opportunityScore < 48) return "weak";
  return "neutral";
}

function fallbackAnalysis(
  card: OpportunityCard,
  expectations: MarketExpectations,
): AiStockAnalysis {
  const cited = [
    ...card.signals.slice(0, 4).map((s) => `${s.label}: ${s.value}`),
    card.keyReason,
  ].filter(Boolean);

  return {
    bullCase: `Bull case leans on ${card.keyReason.toLowerCase()} with opportunity score ${card.opportunityScore}/100${
      card.potentialUpsidePct != null
        ? ` and ~${card.potentialUpsidePct.toFixed(1)}% analyst upside`
        : ""
    }.`,
    bearCase: `Bear case centers on risk score ${card.riskScore}/100${
      card.maxDrawdown1yPct != null
        ? ` and 1Y max drawdown ${card.maxDrawdown1yPct.toFixed(1)}%`
        : ""
    }; expectations may be wrong if growth resets.`,
    whatMarketExpects: expectations.gapSummary,
    catalysts: [
      card.upcomingCatalyst,
      ...card.happening.filter((h) => h.kind === "news").map((h) => h.detail),
    ].filter((x): x is string => Boolean(x)),
    keyRisks: expectations.falsifiers.slice(0, 3),
    verdict: verdictFromScores(card),
    citedFacts: cited.slice(0, 6),
    aiGenerated: false,
  };
}

/**
 * Models occasionally return JSON that is truncated by the token cap, or that
 * carries an unescaped quote inside a prose field. Try the strict slice first,
 * then a repaired version that closes whatever is still open.
 */
export function parseLooseJson<T>(content: string): T | null {
  const start = content.indexOf("{");
  const body = start >= 0 ? content.slice(start) : content;
  const end = body.lastIndexOf("}");

  const candidates = [end >= 0 ? body.slice(0, end + 1) : body, repairTruncatedJson(body)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function repairTruncatedJson(body: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of body) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }

  if (!inString && stack.length === 0) return null;

  let repaired = body;
  if (escaped) repaired = repaired.slice(0, -1);
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return repaired;
}

/** Last resort for hunt rationales: pull the pairs out of unparseable text. */
export function salvageRationales(content: string): Array<{ symbol: string; rationale: string }> {
  const pattern = /"symbol"\s*:\s*"([^"]+)"\s*,\s*"rationale"\s*:\s*"([\s\S]*?)"\s*[},]/g;
  const items: Array<{ symbol: string; rationale: string }> = [];
  for (const match of content.matchAll(pattern)) {
    items.push({ symbol: match[1], rationale: match[2] });
  }
  return items;
}

export async function buildAiStockAnalysis(
  card: OpportunityCard,
  expectations: MarketExpectations,
): Promise<AiStockAnalysis> {
  const fallback = fallbackAnalysis(card, expectations);
  if (!isDeepSeekEnabled()) return fallback;

  const content = await deepseekChat(
    [
      {
        role: "system",
        content:
          'You are a markets research analyst. Use ONLY the provided facts. Return strict JSON: {"bullCase":"","bearCase":"","whatMarketExpects":"","catalysts":[""],"keyRisks":[""],"verdict":"strong_opportunity|attractive|neutral|weak|avoid","citedFacts":[""]}. Each prose field max 40 words. Verdict must fit the scores. No disclaimers.',
      },
      {
        role: "user",
        content: JSON.stringify({
          symbol: card.symbol,
          opportunityScore: card.opportunityScore,
          riskScore: card.riskScore,
          convictionScore: card.convictionScore,
          action: card.action,
          price: card.price,
          upsidePct: card.potentialUpsidePct,
          keyReason: card.keyReason,
          categories: card.categories,
          signals: card.signals,
          expectations,
          happening: card.happening.map((h) => ({
            kind: h.kind,
            fact: h.fact,
            title: h.title,
          })),
        }),
      },
    ],
    { temperature: 0.25, maxTokens: 700, json: true },
  );

  if (!content) return fallback;

  const parsed = parseLooseJson<Partial<AiStockAnalysis>>(content);
  if (!parsed) {
    console.error("Failed to parse DeepSeek analyst JSON", content.slice(0, 400));
    return fallback;
  }

  const allowed: AnalystVerdict[] = [
    "strong_opportunity",
    "attractive",
    "neutral",
    "weak",
    "avoid",
  ];
  const verdict =
    parsed.verdict && allowed.includes(parsed.verdict as AnalystVerdict)
      ? (parsed.verdict as AnalystVerdict)
      : fallback.verdict;

  return {
    bullCase: String(parsed.bullCase || fallback.bullCase).slice(0, 320),
    bearCase: String(parsed.bearCase || fallback.bearCase).slice(0, 320),
    whatMarketExpects: String(parsed.whatMarketExpects || fallback.whatMarketExpects).slice(
      0,
      320,
    ),
    catalysts: Array.isArray(parsed.catalysts)
      ? parsed.catalysts.map(String).slice(0, 5)
      : fallback.catalysts,
    keyRisks: Array.isArray(parsed.keyRisks)
      ? parsed.keyRisks.map(String).slice(0, 5)
      : fallback.keyRisks,
    verdict,
    citedFacts: Array.isArray(parsed.citedFacts)
      ? parsed.citedFacts.map(String).slice(0, 8)
      : fallback.citedFacts,
    aiGenerated: true,
  };
}

export async function enrichHuntRationales(
  cards: OpportunityCard[],
  enabled = true,
): Promise<OpportunityCard[]> {
  if (!enabled || !isDeepSeekEnabled() || cards.length === 0) {
    return cards.map((c) => ({
      ...c,
      rationale: c.rationale || `${c.action.toUpperCase()} ${c.symbol}: ${c.keyReason}`,
    }));
  }

  const content = await deepseekChat(
    [
      {
        role: "system",
        content:
          'For each ticker write ONE rationale (max 30 words) citing supplied scores/facts. Return JSON {"items":[{"symbol":"AAPL","rationale":"..."}]}',
      },
      {
        role: "user",
        content: JSON.stringify({
          items: cards.map((c) => ({
            symbol: c.symbol,
            action: c.action,
            opportunityScore: c.opportunityScore,
            riskScore: c.riskScore,
            convictionScore: c.convictionScore,
            keyReason: c.keyReason,
            upsidePct: c.potentialUpsidePct,
            categories: c.categories,
            facts: c.signals.slice(0, 4).map((s) => `${s.label}=${s.value}`),
          })),
        }),
      },
    ],
    { temperature: 0.3, maxTokens: Math.min(2000, 110 * cards.length + 160), json: true },
  );

  const map = new Map<string, string>();
  if (content) {
    const parsed = parseLooseJson<{ items?: Array<{ symbol?: string; rationale?: string }> }>(
      content,
    );
    const items = parsed?.items ?? salvageRationales(content);
    if (!parsed) {
      console.error(
        `Failed to parse DeepSeek hunt rationales; salvaged ${items.length}/${cards.length}`,
        content.slice(0, 400),
      );
    }
    for (const item of items) {
      if (item.symbol && item.rationale) {
        map.set(item.symbol.toUpperCase(), item.rationale.trim());
      }
    }
  }

  return cards.map((c) => ({
    ...c,
    rationale: map.get(c.symbol) || c.rationale || `${c.action.toUpperCase()} ${c.symbol}: ${c.keyReason}`,
  }));
}
