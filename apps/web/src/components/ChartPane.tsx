import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { HistoryRange } from "@trader/shared";
import { fetchAnalytics, fetchHistory } from "../lib/queries";
import { PriceChart } from "./PriceChart";

const RANGES: HistoryRange[] = ["1m", "3m", "1y", "5y", "max"];

type Props = {
  symbol: string | null;
};

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function ChartPane({ symbol }: Props) {
  const [range, setRange] = useState<HistoryRange>("1y");
  const [amount, setAmount] = useState(1000);
  const [dipPct, setDipPct] = useState(10);

  const history = useQuery({
    queryKey: ["history", symbol, range],
    queryFn: () => fetchHistory(symbol!, range),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });

  const analytics = useQuery({
    queryKey: ["analytics", symbol, range, amount, dipPct],
    queryFn: () => fetchAnalytics(symbol!, { range, amount, dipPct }),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });

  if (!symbol) {
    return (
      <div className="pane-right">
        <div className="empty-state">
          <strong>Select a stock</strong>
          <span>Pick a symbol from your watchlist to see history and dip analytics.</span>
        </div>
      </div>
    );
  }

  const a = analytics.data;

  return (
    <div className="pane-right">
      <div className="chart-toolbar">
        <h1>{symbol}</h1>
        <div className="range-tabs">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? "active" : ""}
              onClick={() => setRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {history.isError && (
        <div className="error-banner">{(history.error as Error).message}</div>
      )}

      <div className="chart-wrap">
        {history.isLoading ? (
          <div className="empty-state">Loading chart…</div>
        ) : history.data?.bars?.length ? (
          <PriceChart bars={history.data.bars} />
        ) : (
          <div className="empty-state">No historical data available.</div>
        )}
      </div>

      <section className="analytics">
        <div className="analytics-controls">
          <div className="field">
            <label htmlFor="amount">What-if amount</label>
            <input
              id="amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 1000)}
            />
          </div>
          <div className="field">
            <label htmlFor="preset">Quick amount</label>
            <select
              id="preset"
              value={amount === 1000 || amount === 10000 ? amount : ""}
              onChange={(e) => {
                if (e.target.value) setAmount(Number(e.target.value));
              }}
            >
              <option value="">Custom</option>
              <option value={1000}>$1,000</option>
              <option value={10000}>$10,000</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dip">Dip threshold %</label>
            <input
              id="dip"
              type="number"
              min={1}
              max={100}
              value={dipPct}
              onChange={(e) => setDipPct(Number(e.target.value) || 10)}
            />
          </div>
        </div>

        {analytics.isError && (
          <div className="error-banner">{(analytics.error as Error).message}</div>
        )}

        {analytics.isLoading || !a ? (
          <div className="muted">Computing analytics…</div>
        ) : (
          <div className="stats-grid">
            <Stat label="Total return" value={fmtPct(a.totalReturnPct)} tone={a.totalReturnPct} />
            <Stat label="Avg daily" value={fmtPct(a.avgDailyReturnPct)} tone={a.avgDailyReturnPct} />
            <Stat label="Avg weekly" value={fmtPct(a.avgWeeklyReturnPct)} tone={a.avgWeeklyReturnPct} />
            <Stat label="Avg monthly" value={fmtPct(a.avgMonthlyReturnPct)} tone={a.avgMonthlyReturnPct} />
            <Stat label="Volatility (daily)" value={fmtPct(a.volatilityDailyPct)} />
            <Stat label="Max drawdown" value={fmtPct(a.maxDrawdownPct)} tone={a.maxDrawdownPct} />
            <Stat
              label={`Dips ≥${a.dipRecovery.dipPct}%`}
              value={String(a.dipRecovery.eventCount)}
            />
            <Stat label="Avg bounce after dip" value={fmtPct(a.dipRecovery.avgBouncePct)} tone={a.dipRecovery.avgBouncePct} />
            <Stat
              label="Avg days to recover"
              value={
                a.dipRecovery.avgDaysToRecovery != null
                  ? a.dipRecovery.avgDaysToRecovery.toFixed(1)
                  : "—"
              }
            />
            <Stat label="Ending value" value={fmtMoney(a.whatIf.endingValue)} />
            <Stat label="Profit" value={fmtMoney(a.whatIf.profit)} tone={a.whatIf.profit} />
            <Stat label="Profit %" value={fmtPct(a.whatIf.profitPct)} tone={a.whatIf.profitPct} />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number | null;
}) {
  const cls =
    tone == null || Number.isNaN(tone) ? "" : tone >= 0 ? "pct-up" : "pct-down";
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
    </div>
  );
}
