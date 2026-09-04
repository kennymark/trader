import type { PnlMonthPoint, SymbolPerformance } from "@trader/shared";

function moneyAxis(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1000) return `${sign}£${Math.round(abs / 1000)}k`;
  return `${sign}£${Math.round(abs)}`;
}

function monthLabel(month: string, withYear = false) {
  const [y, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = names[Number(m) - 1] || month;
  return withYear ? `${label} ${y?.slice(2)}` : label;
}

export function CumulativePnlChart({ series }: { series: PnlMonthPoint[] }) {
  if (series.length < 2) return null;
  const w = 640;
  const h = 220;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const values = series.map((s) => s.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (series.length - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - ((v - min) / span) * innerH;
  const line = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s.cumulative)}`).join(" ");
  const area = `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [min, 0, max].filter((v, i, a) => a.indexOf(v) === i);
  const last = series[series.length - 1]!;
  const first = series[0]!;
  const mid = series[Math.floor(series.length / 2)]!;
  const up = last.cumulative >= 0;

  return (
    <figure className="pnl-chart">
      <figcaption>
        <div>
          <div className="pnl-chart-title">Cumulative realized P&L</div>
          <div className="muted">Sells + dividends, monthly · GBP</div>
        </div>
        <div className={`tabular ${up ? "pnl-up" : "pnl-down"}`}>{moneyAxis(last.cumulative)}</div>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Cumulative realized profit and loss">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? "pnl-chart-zero" : "pnl-chart-grid"}
            />
            <text x={pad.l - 6} y={y(t) + 3} className="pnl-chart-axis" textAnchor="end">
              {moneyAxis(t)}
            </text>
          </g>
        ))}
        <path d={area} className={up ? "pnl-area-up" : "pnl-area-down"} />
        <path d={line} className={up ? "pnl-line-up" : "pnl-line-down"} />
        <text x={x(0)} y={h - 8} className="pnl-chart-axis">
          {monthLabel(first.month, true)}
        </text>
        <text x={x(Math.floor(series.length / 2))} y={h - 8} className="pnl-chart-axis" textAnchor="middle">
          {monthLabel(mid.month, true)}
        </text>
        <text x={x(series.length - 1)} y={h - 8} className="pnl-chart-axis" textAnchor="end">
          {monthLabel(last.month, true)}
        </text>
      </svg>
    </figure>
  );
}

export function MonthlyPnlChart({ series }: { series: PnlMonthPoint[] }) {
  const recent = series.slice(-36);
  if (recent.length === 0) return null;
  const w = 640;
  const h = 220;
  const pad = { l: 44, r: 12, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxAbs = Math.max(1, ...recent.map((s) => Math.abs(s.pnl)));
  const gap = 1.5;
  const barW = Math.max(2, innerW / recent.length - gap);
  const y0 = pad.t + innerH / 2;
  const y = (v: number) => y0 - (v / maxAbs) * (innerH / 2);
  const ticks = [-maxAbs, 0, maxAbs];

  return (
    <figure className="pnl-chart">
      <figcaption>
        <div>
          <div className="pnl-chart-title">Monthly realized P&L</div>
          <div className="muted">Last {recent.length} months · GBP</div>
        </div>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Monthly realized profit and loss">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? "pnl-chart-zero" : "pnl-chart-grid"}
            />
            <text x={pad.l - 6} y={y(t) + 3} className="pnl-chart-axis" textAnchor="end">
              {moneyAxis(t)}
            </text>
          </g>
        ))}
        {recent.map((s, i) => {
          const x = pad.l + i * (barW + gap);
          const top = Math.min(y(s.pnl), y0);
          const height = Math.max(1, Math.abs(y(s.pnl) - y0));
          return (
            <rect
              key={s.month}
              x={x}
              y={top}
              width={barW}
              height={height}
              className={s.pnl >= 0 ? "pnl-bar-up" : "pnl-bar-down"}
            />
          );
        })}
        <text x={pad.l} y={h - 8} className="pnl-chart-axis">
          {monthLabel(recent[0]!.month, true)}
        </text>
        <text x={w - pad.r} y={h - 8} className="pnl-chart-axis" textAnchor="end">
          {monthLabel(recent[recent.length - 1]!.month, true)}
        </text>
      </svg>
    </figure>
  );
}

export function NamePnlChart({
  rows,
  selected,
  onSelect,
}: {
  rows: SymbolPerformance[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const ranked = [...rows]
    .filter((r) => Math.abs(r.totalPnl) >= 1)
    .sort((a, b) => Math.abs(b.totalPnl) - Math.abs(a.totalPnl))
    .slice(0, 12);
  if (ranked.length === 0) return null;

  const hasNeg = ranked.some((r) => r.totalPnl < 0);
  const hasPos = ranked.some((r) => r.totalPnl > 0);
  const w = 640;
  const rowH = 24;
  // Extra left room when bars grow left (losers); extra right when they grow right
  const pad = {
    l: hasNeg ? 96 : 72,
    r: hasPos ? 72 : 48,
    t: 8,
    b: 8,
  };
  const h = pad.t + pad.b + ranked.length * rowH;
  const innerW = w - pad.l - pad.r;
  const maxAbs = Math.max(1, ...ranked.map((r) => Math.abs(r.totalPnl)));
  // Keep a gutter so value labels never collide with tickers or the chart edge
  const valueGutter = 54;
  const half = innerW / 2;
  const maxBar = Math.max(12, half - valueGutter);
  const x0 = pad.l + half;

  return (
    <figure className="pnl-chart">
      <figcaption>
        <div>
          <div className="pnl-chart-title">P&L by name</div>
          <div className="muted">Click a bar to open the trade sheet · GBP</div>
        </div>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Profit and loss by stock">
        <line x1={x0} x2={x0} y1={pad.t} y2={h - pad.b} className="pnl-chart-zero" />
        {ranked.map((r, i) => {
          const cy = pad.t + i * rowH + rowH / 2;
          const width = (Math.abs(r.totalPnl) / maxAbs) * maxBar;
          const isPos = r.totalPnl >= 0;
          const x = isPos ? x0 : x0 - width;
          const isSel = selected === r.key;
          const labelX = isPos ? x0 + width + 8 : x - 8;
          return (
            <g
              key={r.key}
              className={`pnl-bar-group ${isSel ? "selected" : ""}`}
              onClick={() => onSelect(r.key)}
            >
              <rect
                x={pad.l}
                y={cy - rowH / 2 + 1}
                width={innerW}
                height={rowH - 2}
                className={`pnl-bar-hit ${isSel ? "selected" : ""}`}
              />
              <text x={pad.l - 10} y={cy + 4} className="pnl-chart-label" textAnchor="end">
                {r.symbol}
              </text>
              <rect
                x={x}
                y={cy - 6}
                width={Math.max(1, width)}
                height={12}
                rx={2}
                className={isPos ? "pnl-bar-up" : "pnl-bar-down"}
              />
              <text
                x={labelX}
                y={cy + 4}
                className="pnl-chart-axis"
                textAnchor={isPos ? "start" : "end"}
              >
                {moneyAxis(r.totalPnl)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function WinLossChart({
  profit,
  loss,
  winCount,
  lossCount,
  winRatePct,
}: {
  profit: number;
  loss: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
}) {
  const gross = Math.max(1, profit + Math.abs(loss));
  const pW = (profit / gross) * 100;
  const lW = (Math.abs(loss) / gross) * 100;
  const rate = winRatePct ?? 0;
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, rate)) / 100) * c;

  return (
    <div className="pnl-winloss">
      <div className="pnl-winloss-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
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
        <div className="pnl-winloss-rate">
          <span className="tabular">{winRatePct != null ? `${Math.round(winRatePct)}%` : "—"}</span>
          <small>win rate</small>
        </div>
      </div>
      <div className="pnl-winloss-bars">
        <div className="pnl-winloss-row">
          <span>Gross profits</span>
          <span className="tabular pnl-up">£{Math.round(profit).toLocaleString("en-GB")}</span>
        </div>
        <div className="pnl-stack">
          <i className="up" style={{ width: `${pW}%` }} />
        </div>
        <div className="pnl-winloss-row">
          <span>Gross losses</span>
          <span className="tabular pnl-down">£{Math.round(Math.abs(loss)).toLocaleString("en-GB")}</span>
        </div>
        <div className="pnl-stack">
          <i className="down" style={{ width: `${lW}%` }} />
        </div>
        <div className="muted" style={{ marginTop: "0.45rem" }}>
          {winCount} names up · {lossCount} names down
        </div>
      </div>
    </div>
  );
}

export function YearCompareChart({
  years,
}: {
  years: Array<{
    year: number;
    youPct: number | null;
    sp500Pct: number | null;
    ftse100Pct: number | null;
  }>;
}) {
  if (years.length === 0) return null;
  const w = 640;
  const h = 240;
  const pad = { l: 40, r: 12, t: 20, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const vals = years.flatMap((y) => [y.youPct, y.sp500Pct, y.ftse100Pct]).filter((v): v is number => v != null);
  const maxAbs = Math.max(10, ...vals.map((v) => Math.abs(v)));
  const y0 = pad.t + innerH / 2;
  const y = (v: number) => y0 - (v / maxAbs) * (innerH / 2);
  const groupW = innerW / years.length;
  const barW = Math.max(4, Math.min(14, groupW / 4 - 2));

  return (
    <figure className="pnl-chart">
      <figcaption>
        <div>
          <div className="pnl-chart-title">Yearly returns %</div>
          <div className="muted">You · S&amp;P 500 · FTSE 100</div>
        </div>
        <div className="pnl-legend">
          <span><i className="you" /> You</span>
          <span><i className="sp" /> S&amp;P 500</span>
          <span><i className="ft" /> FTSE 100</span>
        </div>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Yearly returns versus market">
        <line x1={pad.l} x2={w - pad.r} y1={y0} y2={y0} className="pnl-chart-zero" />
        <text x={pad.l - 6} y={y(maxAbs) + 3} className="pnl-chart-axis" textAnchor="end">
          +{Math.round(maxAbs)}%
        </text>
        <text x={pad.l - 6} y={y(-maxAbs) + 3} className="pnl-chart-axis" textAnchor="end">
          −{Math.round(maxAbs)}%
        </text>
        {years.map((row, i) => {
          const gx = pad.l + i * groupW + groupW / 2;
          const series = [
            { v: row.youPct, cls: "pnl-bar-you" },
            { v: row.sp500Pct, cls: "pnl-bar-sp" },
            { v: row.ftse100Pct, cls: "pnl-bar-ft" },
          ];
          return (
            <g key={row.year}>
              {series.map((s, si) => {
                if (s.v == null) return null;
                const bx = gx - (1.5 * barW + 2) + si * (barW + 2);
                const top = Math.min(y(s.v), y0);
                const height = Math.max(1, Math.abs(y(s.v) - y0));
                return (
                  <rect
                    key={si}
                    x={bx}
                    y={top}
                    width={barW}
                    height={height}
                    rx={1}
                    className={s.cls}
                  />
                );
              })}
              <text x={gx} y={h - 10} className="pnl-chart-axis" textAnchor="middle">
                {String(row.year).slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
