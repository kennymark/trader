import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  OpportunityBreakdown,
  ScenarioAssumptions,
  SymbolIntelligenceDetail,
} from "@trader/shared";
import { fetchSymbolIntelligence, simulateScenarios } from "../lib/queries";

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function fmtPrice(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const VERDICT_LABEL: Record<string, string> = {
  strong_opportunity: "Strong Opportunity",
  attractive: "Attractive",
  neutral: "Neutral",
  weak: "Weak",
  avoid: "Avoid",
};

const BREAKDOWN_ORDER: Array<keyof OpportunityBreakdown> = [
  "fundamentals",
  "valuation",
  "earningsMomentum",
  "technicals",
  "insiderActivity",
  "catalysts",
  "sentiment",
];

function ScoreRing({ score, label }: { score: number; label: string }) {
  const size = 112;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;

  return (
    <div className="score-ring" aria-label={`Opportunity score ${score} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="score-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-label">
        <div className="score-ring-num tabular">
          {score}
          <span>/100</span>
        </div>
        <div className="score-ring-caption">{label}</div>
      </div>
    </div>
  );
}

function BreakdownBars({ breakdown }: { breakdown: OpportunityBreakdown }) {
  return (
    <div className="score-bars">
      {BREAKDOWN_ORDER.map((key) => {
        const c = breakdown[key];
        return (
          <div key={key} className="score-bar-row">
            <div className="score-bar-meta">
              <span>{c.label}</span>
              <span className="tabular">{c.score}</span>
            </div>
            <div className="score-bar-track">
              <div className="score-bar-fill" style={{ width: `${c.score}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  symbol: string;
  embedded?: boolean;
};

export function SymbolIntelligence({ symbol }: Props) {
  const detail = useQuery({
    queryKey: ["symbol-intelligence", symbol],
    queryFn: () => fetchSymbolIntelligence(symbol),
    staleTime: 5 * 60_000,
  });

  const [assumptions, setAssumptions] = useState<ScenarioAssumptions | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [section, setSection] = useState<"overview" | "analysis" | "more">("overview");

  useEffect(() => {
    if (detail.data?.scenarios.baseAssumptions) {
      setAssumptions(detail.data.scenarios.baseAssumptions);
    }
  }, [detail.data?.scenarios.baseAssumptions]);

  const scenarioMut = useMutation({
    mutationFn: (next: ScenarioAssumptions) => simulateScenarios(symbol, next),
  });

  if (detail.isLoading) {
    return <div className="empty-state">Loading intelligence…</div>;
  }
  if (detail.isError) {
    return <div className="form-error">{(detail.error as Error).message}</div>;
  }
  if (!detail.data) return null;

  const d: SymbolIntelligenceDetail = detail.data;
  const o = d.opportunity;
  const bands = scenarioMut.data?.bands || d.scenarios.bands;
  const a = assumptions || d.scenarios.baseAssumptions;
  const verdictLabel = VERDICT_LABEL[d.aiAnalysis.verdict] || d.aiAnalysis.verdict;
  const scoreLabel =
    o.opportunityScore >= 80
      ? "Strong Opportunity"
      : o.opportunityScore >= 65
        ? "Attractive"
        : o.opportunityScore >= 45
          ? "Neutral"
          : o.opportunityScore >= 30
            ? "Weak"
            : "Avoid";

  const analystEps = d.expectations.impliedEarningsGrowthPct;
  const priceImpliedEps =
    analystEps != null
      ? Math.round(analystEps * 0.55 * 10) / 10
      : null;
  const internalEps =
    analystEps != null && o.potentialUpsidePct != null
      ? Math.round((analystEps + Math.max(0, o.potentialUpsidePct) * 0.15) * 10) / 10
      : analystEps;
  const gapPp =
    priceImpliedEps != null && internalEps != null
      ? Math.round((internalEps - priceImpliedEps) * 10) / 10
      : d.expectations.expectationGap;

  return (
    <div className="symbol-intel">
      <header className="symbol-intel-hero">
        <div>
          <div className="symbol-intel-kicker">
            <span className="intel-symbol">{o.symbol}</span>
            {o.displayName ? <span className="muted">{o.displayName}</span> : null}
          </div>
          <div className="symbol-intel-price-row">
            <span className="symbol-intel-price tabular">{fmtPrice(o.price)}</span>
            <span
              className={`tabular ${
                (o.changePercent ?? 0) >= 0 ? "change-up" : "change-down"
              }`}
            >
              {fmtPct(o.changePercent)}
            </span>
          </div>
        </div>
        <div className="symbol-intel-mini-scores">
          <div>
            <div className="stat-label">Risk</div>
            <div className="tabular">{o.riskScore}</div>
          </div>
          <div>
            <div className="stat-label">Conviction</div>
            <div className="tabular">{o.convictionScore}</div>
          </div>
        </div>
      </header>

      <nav className="symbol-intel-tabs" aria-label="Intelligence sections">
        {(
          [
            ["overview", "Overview"],
            ["analysis", "Analysis"],
            ["more", "More"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {(section === "overview" || section === "analysis") && (
        <>
          <section className="symbol-intel-card">
            <div className="symbol-intel-card-head">
              <h3>Opportunity Score</h3>
              <span className="muted">Heuristic · not a prediction</span>
            </div>
            <div className="score-panel">
              <ScoreRing score={o.opportunityScore} label={scoreLabel} />
              <BreakdownBars breakdown={o.breakdown} />
            </div>
            <p className="symbol-intel-reason">{o.keyReason}</p>
          </section>

          <section className="symbol-intel-card">
            <div className="symbol-intel-card-head">
              <h3>Market Expectations</h3>
            </div>
            <div className="expect-grid">
              <div className="expect-cell">
                <div className="stat-label">Price implies</div>
                <div className="expect-value tabular">{fmtPct(priceImpliedEps)}</div>
                <div className="muted">EPS growth</div>
              </div>
              <div className="expect-cell">
                <div className="stat-label">Analyst consensus</div>
                <div className="expect-value tabular">{fmtPct(analystEps)}</div>
                <div className="muted">EPS growth</div>
              </div>
              <div className="expect-cell expect-cell-accent">
                <div className="stat-label">Internal estimate</div>
                <div className="expect-value tabular">{fmtPct(internalEps)}</div>
                <div className="muted">EPS growth</div>
              </div>
            </div>
            <div className="expect-gap">
              <strong>
                Expectation gap:{" "}
                {gapPp == null
                  ? "—"
                  : `${gapPp > 0 ? "+" : ""}${typeof gapPp === "number" && Math.abs(gapPp) > 5 ? gapPp.toFixed(1) : gapPp}${typeof gapPp === "number" && Math.abs(gapPp) > 5 ? " pp" : ""}`}
              </strong>
              <p className="muted">{d.expectations.gapSummary}</p>
              <p className="muted">{d.expectations.opportunityWhy}</p>
            </div>
          </section>
        </>
      )}

      {(section === "overview" || section === "analysis") && (
        <section className="symbol-intel-card">
          <div className="symbol-intel-card-head">
            <h3>AI Analyst</h3>
            <span className="muted">
              {d.aiAnalysis.aiGenerated ? "DeepSeek" : "Rule-based"}
            </span>
          </div>
          <div className="ai-layout">
            <div className="ai-grid">
              <div className="ai-cell">
                <div className="ai-cell-label">Bull case</div>
                <p>{d.aiAnalysis.bullCase}</p>
              </div>
              <div className="ai-cell">
                <div className="ai-cell-label">Bear case</div>
                <p>{d.aiAnalysis.bearCase}</p>
              </div>
              <div className="ai-cell">
                <div className="ai-cell-label">Catalysts</div>
                <p>
                  {d.aiAnalysis.catalysts.length
                    ? d.aiAnalysis.catalysts.join(" · ")
                    : "No clear near-term catalysts surfaced."}
                </p>
              </div>
              <div className="ai-cell">
                <div className="ai-cell-label">Key risks</div>
                <p>
                  {d.aiAnalysis.keyRisks.length
                    ? d.aiAnalysis.keyRisks.join(" · ")
                    : "Standard equity / execution risk."}
                </p>
              </div>
            </div>
            <aside className={`ai-verdict ai-verdict-${d.aiAnalysis.verdict}`}>
              <div className="stat-label">Verdict</div>
              <div className="ai-verdict-title">{verdictLabel}</div>
              <div className="ai-confidence">
                <div className="stat-label">Confidence</div>
                <div className="intel-confidence">
                  <div className="intel-confidence-track">
                    <div
                      className="intel-confidence-fill"
                      style={{ width: `${Math.round(o.confidence * 100)}%` }}
                    />
                  </div>
                  <span>{Math.round(o.confidence * 100)}%</span>
                </div>
              </div>
              <p className="muted ai-verdict-market">{d.aiAnalysis.whatMarketExpects}</p>
            </aside>
          </div>
          {d.aiAnalysis.citedFacts.length ? (
            <div className="symbol-intel-cites muted">
              Cited: {d.aiAnalysis.citedFacts.slice(0, 4).join("; ")}
            </div>
          ) : null}
        </section>
      )}

      {(section === "overview" || section === "analysis") && (
        <section className="symbol-intel-card">
          <div className="symbol-intel-card-head">
            <h3>Scenario Simulator</h3>
            <button
              type="button"
              className="btn"
              onClick={() => setShowAssumptions((v) => !v)}
            >
              {showAssumptions ? "Hide assumptions" : "Adjust assumptions"}
            </button>
          </div>

          {showAssumptions ? (
            <>
              <div className="scenario-grid">
                {(
                  [
                    ["revenueGrowthPct", "Rev growth %"],
                    ["epsGrowthPct", "EPS growth %"],
                    ["operatingMarginPct", "Op. margin %"],
                    ["fcfMarginPct", "FCF margin %"],
                    ["peMultiple", "P/E"],
                    ["evEbitdaMultiple", "EV/EBITDA"],
                    ["terminalGrowthPct", "Terminal g %"],
                    ["years", "Years"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="field">
                    <span>{label}</span>
                    <input
                      type="number"
                      step="any"
                      value={a[key]}
                      onChange={(e) =>
                        setAssumptions({
                          ...a,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: "0.65rem" }}
                disabled={!assumptions || scenarioMut.isPending}
                onClick={() => assumptions && scenarioMut.mutate(assumptions)}
              >
                {scenarioMut.isPending ? "Simulating…" : "Run scenarios"}
              </button>
            </>
          ) : null}

          <div className="scenario-table-wrap">
            <table className="scenario-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Rev CAGR</th>
                  <th>EPS CAGR</th>
                  <th>P/E</th>
                  <th>Implied</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="tabular">{fmtPct(b.assumptions.revenueGrowthPct)}</td>
                    <td className="tabular">{fmtPct(b.assumptions.epsGrowthPct)}</td>
                    <td className="tabular">{b.assumptions.peMultiple.toFixed(1)}</td>
                    <td className="tabular">{fmtPrice(b.impliedPrice)}</td>
                    <td
                      className={`tabular ${
                        (b.impliedReturnPct ?? 0) >= 0 ? "change-up" : "change-down"
                      }`}
                    >
                      {fmtPct(b.impliedReturnPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: "0.55rem" }}>
            {d.scenarios.disclaimer}
          </p>
        </section>
      )}

      {section === "more" ? (
        <>
          <section className="symbol-intel-card">
            <div className="symbol-intel-card-head">
              <h3>Historical patterns</h3>
            </div>
            {d.patterns.length === 0 ? (
              <div className="muted">Not enough history for pattern matches.</div>
            ) : (
              d.patterns.map((p) => (
                <div key={p.patternId} className="hunt-feed-item">
                  <div className="hunt-feed-title">{p.label}</div>
                  <div className="muted">{p.description}</div>
                  <div className="tabular muted">
                    n={p.sampleSize} · avg {fmtPct(p.avgReturnPct)} · win{" "}
                    {p.winRatePct != null ? `${p.winRatePct.toFixed(0)}%` : "—"}
                  </div>
                </div>
              ))
            )}
          </section>

          {d.happening.length > 0 ? (
            <section className="symbol-intel-card">
              <div className="symbol-intel-card-head">
                <h3>Something is happening</h3>
              </div>
              {d.happening.map((h) => (
                <div key={h.id} className="hunt-happening-item">
                  <div className="hunt-happening-title">{h.title}</div>
                  <div className="muted">Fact: {h.fact}</div>
                  {h.speculation ? (
                    <div className="muted">Speculation: {h.speculation}</div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {d.catalysts.length > 0 ? (
            <section className="symbol-intel-card">
              <div className="symbol-intel-card-head">
                <h3>Catalysts</h3>
              </div>
              {d.catalysts.map((c) => (
                <div key={c.id} className="muted" style={{ marginBottom: "0.35rem" }}>
                  {c.title}
                  {c.date ? ` · ${new Date(c.date).toLocaleDateString()}` : ""}
                </div>
              ))}
            </section>
          ) : null}

          <section className="symbol-intel-card">
            <div className="symbol-intel-card-head">
              <h3>What could make the thesis wrong</h3>
            </div>
            <ul className="symbol-intel-list">
              {d.expectations.falsifiers.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
