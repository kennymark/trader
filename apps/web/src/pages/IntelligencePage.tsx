import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type {
  CatalystEvent,
  FeedItem,
  OpportunityBreakdown,
  OpportunityCard,
  OpportunityCategory,
  PredictionDashboard,
  Quote,
} from "@trader/shared";
import { AUTH_ENABLED } from "../lib/features";
import { getGuestSymbols } from "../lib/guestWatchlist";
import { authClient } from "../lib/auth";
import {
  fetchHistory,
  fetchIntelligence,
  fetchPredictions,
  fetchQuotes,
  fetchWatchlist,
} from "../lib/queries";

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  high_conviction: "High Conviction",
  undervalued: "Undervalued",
  momentum: "Momentum",
  catalyst_plays: "Catalyst Plays",
  beaten_down: "Beaten Down",
  something_happening: "Something Is Happening",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as OpportunityCategory[];

const BREAKDOWN_KEYS: Array<keyof OpportunityBreakdown> = [
  "fundamentals",
  "valuation",
  "earningsMomentum",
  "technicals",
  "insiderActivity",
  "catalysts",
  "sentiment",
];

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtPrice(n: number | null | undefined, currency?: string) {
  if (n == null || Number.isNaN(n)) return "—";
  const value = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${value} ${currency}` : value;
}

function riskLabel(score: number) {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const stroke = Math.max(6, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  return (
    <div className="hunt-ring" style={{ width: size, height: size }}>
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
      <div className="hunt-ring-label">
        <span className="tabular">{score}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) {
    return <div className="hunt-spark hunt-spark-empty" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 36;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className={`hunt-spark ${up ? "up" : "down"}`} viewBox={`0 0 ${w} ${h}`} width="100%" height={36}>
      <polyline fill="none" strokeWidth="2" points={pts} />
    </svg>
  );
}

function RadarChart({ breakdown }: { breakdown: OpportunityBreakdown }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 72;
  const n = BREAKDOWN_KEYS.length;
  const points = BREAKDOWN_KEYS.map((key, i) => {
    const score = breakdown[key].score / 100;
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      key,
      label: breakdown[key].label,
      score: breakdown[key].score,
      x: cx + Math.cos(angle) * radius * score,
      y: cy + Math.sin(angle) * radius * score,
      lx: cx + Math.cos(angle) * (radius + 18),
      ly: cy + Math.sin(angle) * (radius + 18),
      ax: cx + Math.cos(angle) * radius,
      ay: cy + Math.sin(angle) * radius,
    };
  });
  const poly = points.map((p) => `${p.x},${p.y}`).join(" ");
  const rings = [0.33, 0.66, 1];

  return (
    <svg className="hunt-radar" viewBox={`0 0 ${size} ${size}`} width="100%" height={200}>
      {rings.map((r) => (
        <polygon
          key={r}
          className="hunt-radar-grid"
          points={BREAKDOWN_KEYS.map((_, i) => {
            const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
            return `${cx + Math.cos(angle) * radius * r},${cy + Math.sin(angle) * radius * r}`;
          }).join(" ")}
        />
      ))}
      {points.map((p) => (
        <line key={p.key} className="hunt-radar-axis" x1={cx} y1={cy} x2={p.ax} y2={p.ay} />
      ))}
      <polygon className="hunt-radar-fill" points={poly} />
      <polygon className="hunt-radar-stroke" points={poly} fill="none" />
      {points.map((p) => (
        <text key={`l-${p.key}`} className="hunt-radar-label" x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle">
          {p.label.split(" ")[0]}
        </text>
      ))}
    </svg>
  );
}

const FEED_KIND_LABELS: Record<FeedItem["kind"], string> = {
  opportunity: "Opportunity",
  happening: "Something happening",
  catalyst: "Catalyst",
  prediction: "Prediction",
  portfolio: "Portfolio",
};

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function FeedList({ items }: { items: FeedItem[] }) {
  const [kindFilter, setKindFilter] = useState<FeedItem["kind"] | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) {
      c[item.kind] = (c[item.kind] || 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return items;
    return items.filter((i) => i.kind === kindFilter);
  }, [items, kindFilter]);

  if (!items.length) {
    return (
      <div className="hunt-feed-empty">
        <div className="hunt-feed-empty-title">No feed activity yet</div>
        <p className="muted">
          Opportunity moves, catalysts, and “something is happening” signals will show up here
          after a Hunt refresh.
        </p>
      </div>
    );
  }

  const kinds = (Object.keys(FEED_KIND_LABELS) as FeedItem["kind"][]).filter(
    (k) => (counts[k] || 0) > 0,
  );

  return (
    <div className="hunt-feed-panel">
      <div className="hunt-feed-head">
        <div>
          <h2>Activity feed</h2>
          <p className="muted">Why each signal matters — ranked by relevance.</p>
        </div>
        <div className="hunt-feed-count tabular">{filtered.length} events</div>
      </div>

      <div className="hunt-chip-row">
        <button
          type="button"
          className={kindFilter === "all" ? "hunt-chip active" : "hunt-chip"}
          onClick={() => setKindFilter("all")}
        >
          All <span>{counts.all}</span>
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className={kindFilter === k ? "hunt-chip active" : "hunt-chip"}
            onClick={() => setKindFilter(k)}
          >
            {FEED_KIND_LABELS[k]} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="hunt-feed-timeline">
        {filtered.map((item) => (
          <article key={item.id} className={`hunt-feed-card hunt-feed-kind-${item.kind}`}>
            <div className="hunt-feed-rail" aria-hidden>
              <span className="hunt-feed-dot" />
            </div>
            <div className="hunt-feed-body">
              <div className="hunt-feed-card-top">
                <div className="hunt-feed-card-meta">
                  <span className={`hunt-feed-kind hunt-feed-kind-badge-${item.kind}`}>
                    {FEED_KIND_LABELS[item.kind]}
                  </span>
                  {item.symbol ? (
                    <span className="hunt-feed-symbol">{item.symbol}</span>
                  ) : null}
                  <span className="muted hunt-feed-time">{relativeTime(item.createdAt)}</span>
                </div>
                {item.score != null ? (
                  <div className="hunt-feed-score" title="Signal strength">
                    <span className="tabular">{item.score}</span>
                  </div>
                ) : null}
              </div>
              <h3 className="hunt-feed-card-title">{item.title}</h3>
              <p className="hunt-feed-card-body">{item.body}</p>
            </div>
          </article>
        ))}
        {!filtered.length ? (
          <div className="muted" style={{ padding: "1rem 0" }}>
            No events in this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

const CATALYST_KIND_LABELS: Record<CatalystEvent["kind"], string> = {
  earnings: "Earnings",
  ex_dividend: "Dividend",
  other: "Other",
};

function daysUntilLabel(iso: string | null) {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dateGroupKey(iso: string | null) {
  if (!iso) return "unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unscheduled";
  return d.toISOString().slice(0, 10);
}

export function CatalystCalendar({ items }: { items: CatalystEvent[] }) {
  const [kindFilter, setKindFilter] = useState<CatalystEvent["kind"] | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) {
      c[item.kind] = (c[item.kind] || 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const list = kindFilter === "all" ? items : items.filter((i) => i.kind === kindFilter);
    return [...list].sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [items, kindFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, CatalystEvent[]>();
    for (const item of filtered) {
      const key = dateGroupKey(item.date);
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!items.length) {
    return (
      <div className="hunt-feed-empty">
        <div className="hunt-feed-empty-title">No catalysts on the calendar</div>
        <p className="muted">
          Earnings, dividends, and other dated events for your watchlist will appear here after a
          Hunt refresh.
        </p>
      </div>
    );
  }

  const kinds = (Object.keys(CATALYST_KIND_LABELS) as CatalystEvent["kind"][]).filter(
    (k) => (counts[k] || 0) > 0,
  );

  return (
    <div className="hunt-cal-panel">
      <div className="hunt-feed-head">
        <div>
          <h2>Catalyst calendar</h2>
          <p className="muted">Upcoming events that could reprice names on your list.</p>
        </div>
        <div className="hunt-feed-count tabular">{filtered.length} events</div>
      </div>

      <div className="hunt-chip-row">
        <button
          type="button"
          className={kindFilter === "all" ? "hunt-chip active" : "hunt-chip"}
          onClick={() => setKindFilter("all")}
        >
          All <span>{counts.all}</span>
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className={kindFilter === k ? "hunt-chip active" : "hunt-chip"}
            onClick={() => setKindFilter(k)}
          >
            {CATALYST_KIND_LABELS[k]} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="hunt-cal-groups">
        {groups.map(([key, group]) => {
          const first = group[0]!;
          const heading =
            key === "unscheduled"
              ? "Unscheduled"
              : new Date(first.date!).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
          return (
            <section key={key} className="hunt-cal-group">
              <div className="hunt-cal-group-head">
                <h3>{heading}</h3>
                <span className="muted">{daysUntilLabel(first.date)}</span>
              </div>
              <div className="hunt-cal-list">
                {group.map((c) => (
                  <article key={c.id} className={`hunt-cal-card hunt-cal-kind-${c.kind}`}>
                    <div className="hunt-cal-datebox">
                      {c.date ? (
                        <>
                          <div className="hunt-cal-month">
                            {new Date(c.date).toLocaleDateString(undefined, { month: "short" })}
                          </div>
                          <div className="hunt-cal-day tabular">
                            {new Date(c.date).getDate()}
                          </div>
                        </>
                      ) : (
                        <div className="hunt-cal-tbd">TBD</div>
                      )}
                    </div>
                    <div className="hunt-cal-main">
                      <div className="hunt-cal-meta">
                        <span className={`hunt-feed-kind hunt-cal-badge-${c.kind}`}>
                          {CATALYST_KIND_LABELS[c.kind]}
                        </span>
                        <span className="hunt-feed-symbol">{c.symbol}</span>
                        <span className="hunt-impact">
                          {c.kind === "earnings" ? "High impact" : "Medium impact"}
                        </span>
                      </div>
                      <h4 className="hunt-cal-title">{c.title}</h4>
                      <p className="muted hunt-cal-detail">
                        {c.displayName ? `${c.displayName} · ` : ""}
                        {c.detail || daysUntilLabel(c.date)}
                        {c.date
                          ? ` · ${new Date(c.date).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : ""}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        {!filtered.length ? (
          <div className="muted" style={{ padding: "1rem 0" }}>
            No events in this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PredictionsPanel({
  data,
  onRefreshHunt,
  refreshing,
}: {
  data: PredictionDashboard;
  onRefreshHunt?: () => void;
  refreshing?: boolean;
}) {
  if (!data.total) {
    return (
      <div className="hunt-track-panel">
        <div className="hunt-feed-head">
          <div>
            <h2>Track record</h2>
            <p className="muted">
              How Hunt signals perform over 7d → 1y. Predictions are saved when you refresh The Hunt.
            </p>
          </div>
        </div>
        <div className="hunt-feed-empty">
          <div className="hunt-feed-empty-title">No tracked theses yet</div>
          <p className="muted">
            Run a Hunt refresh to snapshot opportunity scores, entry prices, and targets. We’ll
            score them automatically as each horizon comes due.
          </p>
          {onRefreshHunt ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "0.85rem" }}
              disabled={refreshing}
              onClick={onRefreshHunt}
            >
              {refreshing ? "Scanning…" : "Refresh The Hunt & start tracking"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="hunt-track-panel">
      <div className="hunt-feed-head">
        <div>
          <h2>Track record</h2>
          <p className="muted">
            Saved theses with entry price & target — evaluated at 7 / 30 / 90 / 180 / 365 days.
          </p>
        </div>
        <div className="hunt-feed-count tabular">{data.total} theses</div>
      </div>

      <div className="hunt-track-stats">
        <div className="hunt-track-stat">
          <div className="stat-label">Tracked</div>
          <div className="hunt-track-stat-value tabular">{data.total}</div>
        </div>
        <div className="hunt-track-stat">
          <div className="stat-label">Evaluated points</div>
          <div className="hunt-track-stat-value tabular">{data.evaluated}</div>
        </div>
        <div className="hunt-track-stat">
          <div className="stat-label">Hit rate</div>
          <div className="hunt-track-stat-value tabular">
            {data.hitRatePct != null ? `${data.hitRatePct}%` : "—"}
          </div>
        </div>
        <div className="hunt-track-stat">
          <div className="stat-label">Avg return</div>
          <div
            className={`hunt-track-stat-value tabular ${
              (data.avgReturnPct ?? 0) >= 0 ? "change-up" : "change-down"
            }`}
          >
            {fmtPct(data.avgReturnPct)}
          </div>
        </div>
      </div>

      <div className="hunt-track-horizons">
        {data.byHorizon.map((h) => (
          <div key={h.horizonDays} className="hunt-track-horizon">
            <div className="stat-label">{h.horizonDays}d</div>
            <div className="tabular">{h.count} evals</div>
            <div className="muted">
              {fmtPct(h.avgReturnPct)}
              {h.hitRatePct != null ? ` · ${h.hitRatePct}% hit` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="hunt-track-list">
        {data.predictions.map((p) => {
          const pending = p.evaluations.filter((e) => !e.evaluatedAt).length;
          const done = p.evaluations.filter((e) => e.evaluatedAt).length;
          const lastEval = [...p.evaluations]
            .reverse()
            .find((e) => e.evaluatedAt != null);
          return (
            <article key={p.id} className="hunt-track-card">
              <div className="hunt-track-card-top">
                <div>
                  <div className="hunt-track-card-meta">
                    <span className="hunt-feed-symbol">{p.symbol}</span>
                    <span className={`hunt-feed-kind hunt-track-action-${p.action}`}>
                      {p.action}
                    </span>
                    <span className="muted hunt-feed-time">
                      {new Date(p.predictedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <h3 className="hunt-cal-title">{p.thesis}</h3>
                </div>
                <div className="hunt-track-scores">
                  <div>
                    <div className="stat-label">Opp</div>
                    <div className="tabular">{p.opportunityScore}</div>
                  </div>
                  <div>
                    <div className="stat-label">Conv</div>
                    <div className="tabular">{p.convictionScore}</div>
                  </div>
                </div>
              </div>

              <div className="hunt-track-prices">
                <div>
                  <div className="stat-label">Entry</div>
                  <div className="tabular">{fmtPrice(p.priceAtPrediction)}</div>
                </div>
                <div>
                  <div className="stat-label">Target</div>
                  <div className="tabular">{fmtPrice(p.targetPrice)}</div>
                </div>
                <div>
                  <div className="stat-label">Status</div>
                  <div>
                    {done === 0
                      ? `${pending} horizons pending`
                      : lastEval?.returnPct != null
                        ? `${fmtPct(lastEval.returnPct)} latest`
                        : `${done} evaluated`}
                  </div>
                </div>
              </div>

              <div className="hunt-track-eval-row">
                {p.evaluations.map((e) => (
                  <div
                    key={e.horizonDays}
                    className={`hunt-track-eval ${e.evaluatedAt ? "done" : "pending"}`}
                  >
                    <div className="stat-label">{e.horizonDays}d</div>
                    {e.evaluatedAt ? (
                      <>
                        <div
                          className={`tabular ${
                            (e.returnPct ?? 0) >= 0 ? "change-up" : "change-down"
                          }`}
                        >
                          {fmtPct(e.returnPct)}
                        </div>
                        <div className="muted">
                          {e.hitTarget == null ? "—" : e.hitTarget ? "Hit" : "Miss"}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="muted">Pending</div>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>
                          due{" "}
                          {new Date(e.dueAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function MarketSnapshot({ quotes }: { quotes: Quote[] }) {
  const labels: Record<string, string> = {
    SPY: "S&P 500",
    QQQ: "Nasdaq 100",
    DIA: "Dow Jones",
  };
  return (
    <div className="hunt-rail-card">
      <h3>Market snapshot</h3>
      <div className="hunt-market-list">
        {quotes.map((q) => (
          <div key={q.symbol} className="hunt-market-row">
            <div>
              <div className="hunt-market-name">{labels[q.symbol] || q.symbol}</div>
              <div className="muted tabular">{q.symbol}</div>
            </div>
            <div className="hunt-market-vals">
              <div className="tabular">{fmtPrice(q.price)}</div>
              <div
                className={`tabular ${
                  (q.changePercent ?? 0) >= 0 ? "change-up" : "change-down"
                }`}
              >
                {fmtPct(q.changePercent)}
              </div>
            </div>
          </div>
        ))}
        {!quotes.length ? <div className="muted">Loading indices…</div> : null}
      </div>
    </div>
  );
}

export function IntelligencePage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const useGuest = AUTH_ENABLED && !session?.user;
  const [category, setCategory] = useState<OpportunityCategory | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"hunt" | "feed" | "catalysts" | "predictions">("hunt");

  const watchlist = useQuery({
    queryKey: ["watchlist", useGuest ? "guest" : "server"],
    queryFn: async () => {
      if (useGuest) return getGuestSymbols().map((symbol) => ({ symbol }));
      const items = await fetchWatchlist();
      return items.map((i) => ({ symbol: i.symbol }));
    },
    enabled: !AUTH_ENABLED || !sessionPending,
  });

  const symbols = (watchlist.data || []).map((i) => i.symbol);

  const intel = useQuery({
    queryKey: ["intelligence", symbols.join(",")],
    queryFn: () => fetchIntelligence(useGuest ? symbols : undefined),
    enabled: Boolean(watchlist.isFetched) && symbols.length > 0,
    staleTime: 5 * 60_000,
  });

  const predictions = useQuery({
    queryKey: ["intelligence-predictions"],
    queryFn: fetchPredictions,
    enabled: tab === "predictions" && (!AUTH_ENABLED || Boolean(session?.user)),
    staleTime: 30_000,
  });

  const market = useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => fetchQuotes(["SPY", "QQQ", "DIA"]),
    staleTime: 60_000,
    enabled: tab === "hunt",
  });

  const allOpps = intel.data?.opportunities || [];
  const topCards = useMemo(() => allOpps.slice(0, 5), [allOpps]);

  const sparkQueries = useQueries({
    queries: topCards.map((card) => ({
      queryKey: ["spark", card.symbol],
      queryFn: async () => {
        const res = await fetchHistory(card.symbol, "1m");
        return res.bars.slice(-24).map((b) => b.close);
      },
      staleTime: 10 * 60_000,
      enabled: tab === "hunt" && topCards.length > 0,
    })),
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOpps.length };
    for (const c of ALL_CATEGORIES) {
      counts[c] = allOpps.filter((o) => o.categories.includes(c)).length;
    }
    return counts;
  }, [allOpps]);

  const opportunities = useMemo(() => {
    if (category === "all") return allOpps;
    return allOpps.filter((r) => r.categories.includes(category));
  }, [allOpps, category]);

  const spotlight: OpportunityCard | null =
    allOpps.find((o) => o.symbol === selected) || allOpps[0] || null;

  const catalysts: CatalystEvent[] = intel.data?.catalysts || [];

  return (
    <div className="hunt-dash">
      <div className="hunt-dash-head">
        <div>
          <h1>The Hunt</h1>
          <p className="page-lead">Smart opportunities. Clear signals. Better decisions.</p>
        </div>
        <div className="hunt-dash-actions">
          <div className="hunt-view-tabs">
            {(
              [
                ["hunt", "Opportunities"],
                ["feed", "Feed"],
                ["catalysts", "Calendar"],
                ["predictions", "Track record"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={intel.isFetching || symbols.length === 0}
            onClick={() => intel.refetch()}
          >
            {intel.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {symbols.length === 0 && watchlist.isFetched ? (
        <div className="empty-state">
          Add stocks to your{" "}
          <Link to="/" style={{ textDecoration: "underline", color: "inherit" }}>
            watchlist
          </Link>{" "}
          to start The Hunt.
        </div>
      ) : null}

      {intel.isLoading ? <div className="empty-state">Scanning your watchlist…</div> : null}
      {intel.isError ? (
        <div className="form-error">{(intel.error as Error).message}</div>
      ) : null}

      {intel.data && tab === "hunt" ? (
        <>
          <div className="hunt-chip-row">
            <button
              type="button"
              className={category === "all" ? "hunt-chip active" : "hunt-chip"}
              onClick={() => setCategory("all")}
            >
              All Opportunities <span>{categoryCounts.all}</span>
            </button>
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={category === c ? "hunt-chip active" : "hunt-chip"}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABELS[c]} <span>{categoryCounts[c]}</span>
              </button>
            ))}
          </div>

          {topCards.length > 0 ? (
            <section className="hunt-feature-row">
              {topCards.map((card, i) => {
                const spark = sparkQueries[i]?.data || [];
                const primaryCat = card.categories[0];
                return (
                  <button
                    key={card.symbol}
                    type="button"
                    className={`hunt-feature-card ${
                      spotlight?.symbol === card.symbol ? "selected" : ""
                    }`}
                    onClick={() => setSelected(card.symbol)}
                  >
                    <div className="hunt-feature-top">
                      <div>
                        <div className="intel-symbol">{card.symbol}</div>
                        <div className="muted hunt-top-name">
                          {card.displayName || card.symbol}
                        </div>
                      </div>
                      <ScoreRing score={card.opportunityScore} size={64} />
                    </div>
                    <div className="hunt-top-price">
                      <span className="tabular">{fmtPrice(card.price)}</span>
                      <span
                        className={`tabular ${
                          (card.changePercent ?? 0) >= 0 ? "change-up" : "change-down"
                        }`}
                      >
                        {fmtPct(card.changePercent)}
                      </span>
                    </div>
                    {primaryCat ? (
                      <span className={`hunt-cat hunt-cat-${primaryCat}`}>
                        {CATEGORY_LABELS[primaryCat]}
                      </span>
                    ) : null}
                    <Sparkline values={spark} up={(card.changePercent ?? 0) >= 0} />
                    <p className="hunt-top-why">{card.keyReason}</p>
                    <div className="muted hunt-feature-foot">
                      {card.upcomingCatalyst || "No near-term catalyst"}
                    </div>
                  </button>
                );
              })}
            </section>
          ) : null}

          <div className="hunt-body-grid">
            <section className="hunt-table-panel">
              <div className="hunt-table-toolbar">
                <h2>Opportunities</h2>
                <div className="muted">
                  Updated {new Date(intel.data.generatedAt).toLocaleString()}
                </div>
              </div>
              {opportunities.length > 0 ? (
                <div className="intel-table-wrap">
                  <table className="intel-table hunt-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Ticker</th>
                        <th>Company</th>
                        <th>Price</th>
                        <th>1D %</th>
                        <th>Score</th>
                        <th>Reason</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunities.map((card, idx) => (
                        <tr
                          key={card.symbol}
                          className={spotlight?.symbol === card.symbol ? "hunt-row-open" : undefined}
                          onClick={() => setSelected(card.symbol)}
                        >
                          <td className="tabular muted">{idx + 1}</td>
                          <td className="intel-symbol">{card.symbol}</td>
                          <td className="muted">{card.displayName || "—"}</td>
                          <td className="tabular">{fmtPrice(card.price)}</td>
                          <td
                            className={`tabular ${
                              (card.changePercent ?? 0) >= 0 ? "change-up" : "change-down"
                            }`}
                          >
                            {fmtPct(card.changePercent)}
                          </td>
                          <td>
                            <ScoreRing score={card.opportunityScore} size={40} />
                          </td>
                          <td>
                            <div className="intel-timing">{card.keyReason}</div>
                          </td>
                          <td>
                            {card.categories[0] ? (
                              <span className={`hunt-cat hunt-cat-${card.categories[0]}`}>
                                {CATEGORY_LABELS[card.categories[0]]}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No opportunities in this category.</div>
              )}
            </section>

            <aside className="hunt-rail">
              <MarketSnapshot quotes={market.data || []} />

              {spotlight ? (
                <div className="hunt-rail-card hunt-spotlight">
                  <h3>Top opportunity</h3>
                  <div className="hunt-spotlight-head">
                    <div>
                      <div className="intel-symbol">{spotlight.symbol}</div>
                      <div className="muted">{spotlight.displayName}</div>
                    </div>
                    <ScoreRing score={spotlight.opportunityScore} size={88} />
                  </div>
                  <div className="hunt-spotlight-stats">
                    <div>
                      <div className="stat-label">Potential upside</div>
                      <div className="tabular change-up">
                        {fmtPct(spotlight.potentialUpsidePct)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Risk</div>
                      <div>{riskLabel(spotlight.riskScore)}</div>
                    </div>
                  </div>
                  <p className="muted">{spotlight.rationale}</p>
                </div>
              ) : null}

              {spotlight ? (
                <div className="hunt-rail-card">
                  <h3>Score breakdown</h3>
                  <RadarChart breakdown={spotlight.breakdown} />
                </div>
              ) : null}

              <div className="hunt-rail-card">
                <h3>Upcoming catalysts</h3>
                <div className="hunt-catalyst-timeline">
                  {catalysts.slice(0, 6).map((c) => (
                    <div key={c.id} className="hunt-catalyst-item">
                      <div className="hunt-catalyst-dot" />
                      <div>
                        <div className="hunt-feed-title">{c.title}</div>
                        <div className="muted">
                          {c.symbol}
                          {c.date ? ` · ${new Date(c.date).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <span className="hunt-impact">
                        {c.kind === "earnings" ? "High" : "Medium"}
                      </span>
                    </div>
                  ))}
                  {!catalysts.length ? (
                    <div className="muted">No catalysts on the calendar yet.</div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {intel.data && tab === "feed" ? <FeedList items={intel.data.feed} /> : null}

      {intel.data && tab === "catalysts" ? (
        <CatalystCalendar items={intel.data.catalysts} />
      ) : null}

      {tab === "predictions" ? (
        AUTH_ENABLED && !session?.user ? (
          <div className="hunt-feed-empty">
            <div className="hunt-feed-empty-title">Sign in to track predictions</div>
            <p className="muted">
              Track record needs a saved account so theses can be scored over time.
            </p>
          </div>
        ) : predictions.isLoading ? (
          <div className="empty-state">Loading track record…</div>
        ) : predictions.data ? (
          <PredictionsPanel
            data={predictions.data}
            refreshing={intel.isFetching}
            onRefreshHunt={async () => {
              await intel.refetch();
              await predictions.refetch();
            }}
          />
        ) : predictions.isError ? (
          <div className="form-error">{(predictions.error as Error).message}</div>
        ) : (
          <div className="empty-state">Loading track record…</div>
        )
      ) : null}

      <p className="muted intel-disclaimer">
        Informational only — not financial advice. Scores use Yahoo data plus optional AI narrative.
      </p>
    </div>
  );
}
