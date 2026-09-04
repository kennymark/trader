import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { HistoryRange } from "@trader/shared";
import { fetchAnalytics, fetchHistory } from "../lib/queries";
import { Drawer } from "./Drawer";
import { PriceChart } from "./PriceChart";
import { SymbolAlerts } from "./SymbolAlerts";
import { SymbolChannels } from "./SymbolChannels";
import { SymbolIntelligence } from "./SymbolIntelligence";

const RANGES: HistoryRange[] = ["1d", "7d", "1m", "3m", "1y", "5y", "max"];

type Props = {
  symbol: string | null;
};

type DrawerKind = "alerts" | "channels" | "intelligence" | null;

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function ChartPane({ symbol }: Props) {
  const [range, setRange] = useState<HistoryRange>("1y");
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  const history = useQuery({
    queryKey: ["history", symbol, range],
    queryFn: () => fetchHistory(symbol!, range),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });

  const analytics = useQuery({
    queryKey: ["analytics", symbol, range],
    queryFn: () => fetchAnalytics(symbol!, { range, amount: 1000, dipPct: 10 }),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });

  if (!symbol) {
    return (
      <div className="pane-right">
        <div className="empty-state">
          <strong>Select a stock</strong>
          <span>Pick a symbol from your watchlist to see history, intelligence, alerts, and channels.</span>
        </div>
      </div>
    );
  }

  const a = analytics.data;

  return (
    <div className="pane-right">
      <div className="chart-toolbar">
        <h1>{symbol}</h1>
        <div className="chart-toolbar-actions">
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
          <div className="symbol-drawer-triggers">
            <button
              type="button"
              className={`btn ${drawer === "intelligence" ? "btn-primary" : ""}`}
              onClick={() => setDrawer("intelligence")}
            >
              Intelligence
            </button>
            <button
              type="button"
              className={`btn ${drawer === "channels" ? "btn-primary" : ""}`}
              onClick={() => setDrawer("channels")}
            >
              Channels
            </button>
            <button
              type="button"
              className={`btn ${drawer === "alerts" ? "btn-primary" : ""}`}
              onClick={() => setDrawer("alerts")}
            >
              Alerts
            </button>
          </div>
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
            <Stat
              label="Avg bounce after dip"
              value={fmtPct(a.dipRecovery.avgBouncePct)}
              tone={a.dipRecovery.avgBouncePct}
            />
            <Stat
              label="Avg days to recover"
              value={
                a.dipRecovery.avgDaysToRecovery != null
                  ? a.dipRecovery.avgDaysToRecovery.toFixed(1)
                  : "—"
              }
            />
          </div>
        )}
      </section>

      <Drawer
        open={drawer === "intelligence"}
        title={`Intelligence · ${symbol}`}
        onClose={() => setDrawer(null)}
        size="wide"
      >
        <SymbolIntelligence key={`intel-${symbol}`} symbol={symbol} embedded />
      </Drawer>

      <Drawer
        open={drawer === "channels"}
        title={`Channels · ${symbol}`}
        onClose={() => setDrawer(null)}
      >
        <SymbolChannels key={`ch-${symbol}`} symbol={symbol} embedded />
      </Drawer>

      <Drawer
        open={drawer === "alerts"}
        title={`Alerts · ${symbol}`}
        onClose={() => setDrawer(null)}
      >
        <SymbolAlerts key={`al-${symbol}`} symbol={symbol} embedded />
      </Drawer>
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
