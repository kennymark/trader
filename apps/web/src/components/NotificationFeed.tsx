import { useMemo, useState } from "react";
import type { FeedItem, IntelligenceAction, PredictionDashboard } from "@trader/shared";
import { relativeTime } from "../lib/format";

const KIND_LABELS: Record<FeedItem["kind"], string> = {
  alert: "Alert fired",
  opportunity: "Call",
  happening: "Something happened",
  catalyst: "Coming up",
  prediction: "Scored",
  portfolio: "Portfolio",
};

const ACTION_LABELS: Record<IntelligenceAction, string> = {
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
};

type SymbolRecord = { evaluated: number; hitRatePct: number | null; avgReturnPct: number | null };

/**
 * How previous calls on each stock actually turned out. A call is worth more
 * or less depending on whether this scoring has been right about this name
 * before, so the record travels with the call rather than living on its own
 * page you have to go and check.
 */
function recordBySymbol(dashboard: PredictionDashboard | undefined) {
  const map = new Map<string, SymbolRecord>();
  if (!dashboard) return map;

  for (const prediction of dashboard.predictions) {
    const scored = prediction.evaluations.filter((e) => e.returnPct != null);
    if (!scored.length) continue;
    const current = map.get(prediction.symbol) ?? {
      evaluated: 0,
      hitRatePct: null,
      avgReturnPct: null,
    };
    const hits = scored.filter((e) => e.hitTarget).length;
    const total = current.evaluated + scored.length;
    const sumReturn =
      (current.avgReturnPct ?? 0) * current.evaluated +
      scored.reduce((sum, e) => sum + (e.returnPct ?? 0), 0);
    const sumHits = ((current.hitRatePct ?? 0) / 100) * current.evaluated + hits;
    map.set(prediction.symbol, {
      evaluated: total,
      avgReturnPct: sumReturn / total,
      hitRatePct: (sumHits / total) * 100,
    });
  }
  return map;
}

function pct(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function NotificationFeed({
  items,
  dashboard,
}: {
  items: FeedItem[];
  dashboard?: PredictionDashboard;
}) {
  const [onlyCalls, setOnlyCalls] = useState(false);
  const records = useMemo(() => recordBySymbol(dashboard), [dashboard]);

  const shown = onlyCalls ? items.filter((i) => Boolean(i.action)) : items;

  if (!items.length) {
    return (
      <p className="muted notif-feed-empty">
        Nothing has happened across your list yet. Refresh the scoring and the calls will land
        here.
      </p>
    );
  }

  return (
    <div className="notif-feed">
      <div className="notif-feed-filter">
        <button
          type="button"
          className={onlyCalls ? "" : "active"}
          onClick={() => setOnlyCalls(false)}
        >
          Everything
        </button>
        <button
          type="button"
          className={onlyCalls ? "active" : ""}
          onClick={() => setOnlyCalls(true)}
        >
          Calls only
        </button>
      </div>

      <ul className="notif-feed-list">
        {shown.map((item) => {
          const record = item.symbol ? records.get(item.symbol) : undefined;
          return (
            <li key={item.id} className={`notif-item notif-item-${item.kind}`}>
              <div className="notif-item-top">
                {item.action ? (
                  <span className={`notif-action notif-action-${item.action}`}>
                    {ACTION_LABELS[item.action]}
                  </span>
                ) : (
                  <span className="notif-kind">{KIND_LABELS[item.kind]}</span>
                )}
                {item.symbol ? <span className="notif-symbol">{item.symbol}</span> : null}
                <span className="muted notif-time">{relativeTime(item.createdAt)}</span>
                {item.confidence != null ? (
                  <span className="muted notif-confidence tabular">
                    {item.confidence}% confident
                  </span>
                ) : null}
              </div>

              <div className="notif-item-title">{item.title}</div>
              <p className="notif-item-body">{item.body}</p>

              {item.reasons?.length ? (
                <>
                  <div className="notif-why-label">Why</div>
                  <ul className="notif-why">
                    {item.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {item.risk ? (
                <p className="notif-risk">
                  <span className="notif-why-label">What would make this wrong</span>
                  {item.risk}
                </p>
              ) : null}

              {record ? (
                <p className="muted notif-record">
                  Past calls on {item.symbol}: {record.evaluated} scored ·{" "}
                  {record.hitRatePct == null ? "—" : `${record.hitRatePct.toFixed(0)}% hit`} ·{" "}
                  {pct(record.avgReturnPct)} average
                </p>
              ) : null}
            </li>
          );
        })}
        {!shown.length ? (
          <li className="muted notif-feed-empty">Nothing carries a call right now.</li>
        ) : null}
      </ul>
    </div>
  );
}
