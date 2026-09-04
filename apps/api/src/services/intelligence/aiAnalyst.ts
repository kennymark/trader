import type {
  AiStockAnalysis,
  AnalystVerdict,
  MarketExpectations,
  OpportunityCard,
} from "@trader/shared";
import { deepseekChat, isDeepSeekEnabled } from "../deepseek.js";

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
    { temperature: 0.25, maxTokens: 700 },
  );

  if (!content) return fallback;

  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? content.slice(start, end + 1) : content) as Partial<
      AiStockAnalysis
    >;
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
  } catch (err) {
    console.error("Failed to parse DeepSeek analyst JSON", err);
    return fallback;
  }
}

export async function enrichHuntRationales(
  cards: OpportunityCard[],
): Promise<OpportunityCard[]> {
  if (!isDeepSeekEnabled() || cards.length === 0) {
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
    { temperature: 0.3, maxTokens: Math.min(1400, 90 * cards.length + 120) },
  );

  const map = new Map<string, string>();
  if (content) {
    try {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      const parsed = JSON.parse(start >= 0 ? content.slice(start, end + 1) : content) as {
        items?: Array<{ symbol?: string; rationale?: string }>;
      };
      for (const item of parsed.items || []) {
        if (item.symbol && item.rationale) {
          map.set(item.symbol.toUpperCase(), item.rationale.trim());
        }
      }
    } catch (err) {
      console.error("Failed to parse DeepSeek hunt rationales", err);
    }
  }

  return cards.map((c) => ({
    ...c,
    rationale: map.get(c.symbol) || c.rationale || `${c.action.toUpperCase()} ${c.symbol}: ${c.keyReason}`,
  }));
}
