import type { PredictionDashboard } from "@trader/shared";
import { formatDate } from "../lib/dates";
import { fmtPct, fmtPrice } from "../lib/format";

const TRACK_EXPLAINER =
  "Every Hunt refresh records what it thinks, with the price that day. Each call is then graded against what the price actually did, a week later and again at a month, three months, six months and a year.";

function horizonLabel(days: number): string {
  if (days >= 365) return "1 year";
  if (days >= 180) return "6 months";
  if (days >= 90) return "3 months";
  if (days >= 30) return "1 month";
  return "1 week";
}

function returnClass(pct: number | null | undefined): string {
  if (pct == null) return "";
  return pct >= 0 ? "change-up" : "change-down";
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
      <div className="track">
        <header className="track-head">
          <h2>Track record</h2>
          <p className="muted">{TRACK_EXPLAINER}</p>
        </header>
        <div className="hunt-feed-empty">
          <div className="hunt-feed-empty-title">Nothing scored yet</div>
          <p className="muted">
            Refresh The Hunt to record what it thinks today. Nothing is graded until the first
            horizon comes due a week later.
          </p>
          {onRefreshHunt ? (
            <button
              type="button"
              className="btn btn-primary track-empty-action"
              disabled={refreshing}
              onClick={onRefreshHunt}
            >
              {refreshing ? "Scanning…" : "Refresh The Hunt and start recording"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // `evaluated` counts graded checkpoints, not calls, so the sentence has to
  // name the unit or it reads as "23 of 14".
  const checkTotal = data.predictions.reduce((acc, p) => acc + p.evaluations.length, 0);
  const pendingTotal = checkTotal - data.evaluated;

  return (
    <div className="track">
      <header className="track-head">
        <h2>Track record</h2>
        <p className="muted">{TRACK_EXPLAINER}</p>
      </header>

      {/* One sentence carries what four unlabelled tiles used to imply badly. */}
      <p className="track-summary">
        <strong>{data.total}</strong> {data.total === 1 ? "call" : "calls"} recorded, each
        checked at five dates. <strong>{data.evaluated}</strong> of those{" "}
        <strong>{checkTotal}</strong> checks have been graded; {pendingTotal} are still waiting
        on their date. Of the graded ones,{" "}
        <strong>{data.hitRatePct != null ? `${data.hitRatePct}%` : "—"}</strong> reached the
        target, and the average move since the call was{" "}
        <strong className={returnClass(data.avgReturnPct)}>{fmtPct(data.avgReturnPct)}</strong>.
      </p>

      {data.evaluated > 0 && data.evaluated < 10 ? (
        <p className="track-caveat">
          Too few grades to mean much yet — read this as a log, not a score.
        </p>
      ) : null}

      <h3 className="track-sub">By how long the call was given</h3>
      <div className="intel-table-wrap">
        <table className="intel-table track-table">
          <thead>
            <tr>
              <th>Horizon</th>
              <th className="num">Graded</th>
              <th className="num">Avg move</th>
              <th className="num">Reached target</th>
            </tr>
          </thead>
          <tbody>
            {data.byHorizon.map((h) => (
              <tr key={h.horizonDays}>
                <td>{horizonLabel(h.horizonDays)}</td>
                <td className="num tabular">{h.count || "—"}</td>
                <td className={`num tabular ${returnClass(h.avgReturnPct)}`}>
                  {fmtPct(h.avgReturnPct)}
                </td>
                <td className="num tabular">
                  {h.hitRatePct != null ? `${h.hitRatePct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="track-sub">Every call</h3>
      <div className="track-list">
        {data.predictions.map((p) => (
          <article key={p.id} className="track-card">
            <div className="track-card-head">
              <span className="hunt-feed-symbol">{p.symbol}</span>
              <span className={`hunt-feed-kind hunt-track-action-${p.action}`}>{p.action}</span>
              <span className="muted">{formatDate(p.predictedAt)}</span>
            </div>

            <p className="track-thesis">{p.thesis}</p>

            {/* Prose, because these five numbers are a sentence, not a grid. */}
            <p className="track-facts muted">
              Entry <span className="tabular">{fmtPrice(p.priceAtPrediction)}</span>
              {p.targetPrice != null ? (
                <>
                  , target <span className="tabular">{fmtPrice(p.targetPrice)}</span>
                </>
              ) : (
                ", no target set"
              )}{" "}
              · opportunity <span className="tabular">{p.opportunityScore}</span>, conviction{" "}
              <span className="tabular">{p.convictionScore}</span>
            </p>

            <div className="track-marks">
              {p.evaluations.map((e) => (
                <div
                  key={e.horizonDays}
                  className={`track-mark ${e.evaluatedAt ? "done" : "pending"}`}
                >
                  <div className="track-mark-when">{horizonLabel(e.horizonDays)}</div>
                  {e.evaluatedAt ? (
                    <>
                      <div className={`track-mark-value tabular ${returnClass(e.returnPct)}`}>
                        {fmtPct(e.returnPct)}
                      </div>
                      <div className="track-mark-note">
                        {e.hitTarget == null ? "—" : e.hitTarget ? "reached target" : "short of target"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="track-mark-value muted">—</div>
                      <div className="track-mark-note">grades {formatDate(e.dueAt)}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
