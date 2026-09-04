import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WhatIfPath, WhatIfPoint, WhatIfResult } from "@trader/shared";
import { fetchWhatIf } from "../lib/queries";
import { formatDate } from "../lib/dates";

type PathId = "actual" | "neverSold" | "reinvested";

/**
 * Three comparable paths, so they need three distinguishable hues. Green and red
 * stay out of it: those mean profit and loss elsewhere, and a path is neither.
 */
const PATH_COLORS: Record<PathId, string> = {
  actual: "var(--text)",
  // Brass marks the path not taken, the one thing this panel exists to show.
  neverSold: "var(--brass)",
  reinvested: "var(--text-muted)",
};

function money(n: number | null | undefined, currency = "GBP") {
  if (n == null || Number.isNaN(n)) return "—";
  const formatted = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = n < 0 ? "−" : "";
  return currency === "GBP" ? `${sign}£${formatted}` : `${sign}${formatted} ${currency}`;
}

function moneyShort(n: number, currency = "GBP") {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const unit = currency === "GBP" ? "£" : "";
  if (abs >= 1_000_000) return `${sign}${unit}${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1000) return `${sign}${unit}${Math.round(abs / 1000)}k`;
  return `${sign}${unit}${Math.round(abs)}`;
}

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** True when a split restatement actually moved the number. */
function restated(raw: number | null, adjusted: number | null) {
  if (raw == null || adjusted == null || raw === 0) return false;
  return Math.abs(adjusted - raw) / Math.abs(raw) > 0.01;
}

function pnlClass(n: number | null | undefined) {
  if (n == null || Math.abs(n) < 0.005) return "";
  return n > 0 ? "pnl-up" : "pnl-down";
}

export function WhatIfPanel({ positionKey }: { positionKey: string }) {
  const query = useQuery({
    queryKey: ["what-if", positionKey],
    queryFn: () => fetchWhatIf(positionKey),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <section className="whatif">
        <div className="whatif-title">If you had never sold</div>
        <p className="muted">Replaying the position…</p>
      </section>
    );
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof Error ? query.error.message : "Could not replay this position.";
    return (
      <section className="whatif">
        <div className="whatif-title">If you had never sold</div>
        <p className="muted">{message}</p>
      </section>
    );
  }

  return <WhatIfBody result={query.data} />;
}

function WhatIfBody({ result }: { result: WhatIfResult }) {
  const { currency } = result;
  const cost = result.difference;
  const headline =
    result.verdict === "sell_cost_you"
      ? `Selling cost you ${money(cost, currency)}`
      : result.verdict === "sell_saved_you"
        ? `Selling saved you ${money(Math.abs(cost), currency)}`
        : "Selling made no real difference";

  return (
    <section className="whatif">
      <div className="whatif-title">If you had never sold</div>

      <div className={`whatif-headline ${result.verdict === "sell_saved_you" ? "good" : result.verdict === "sell_cost_you" ? "bad" : ""}`}>
        <div className="whatif-headline-value">{headline}</div>
        <div className="muted">
          {result.sales.length} sale{result.sales.length === 1 ? "" : "s"} ·{" "}
          {result.sharesSold.toLocaleString("en-GB", { maximumFractionDigits: 4 })} shares ·{" "}
          {result.symbol} at {money(result.priceNow, currency)} today
          {result.differencePct != null ? ` · ${pct(result.differencePct)} of what you put in` : ""}
        </div>
      </div>

      <div className="whatif-cards">
        <PathCard
          id="actual"
          label="What you did"
          detail={
            result.sharesStillHeld > 0
              ? `${result.sharesStillHeld.toLocaleString("en-GB", { maximumFractionDigits: 4 })} shares still held + cash`
              : "Sold out, proceeds held as cash"
          }
          path={result.actual}
          currency={currency}
        />
        <PathCard
          id="neverSold"
          label="If you had held"
          detail={`${result.neverSold.shares.toLocaleString("en-GB", { maximumFractionDigits: 4 })} shares today`}
          path={result.neverSold}
          currency={currency}
          highlight
        />
        {result.reinvested ? (
          <PathCard
            id="reinvested"
            label={`If you bought ${result.reinvested.label}`}
            detail="Proceeds into the index on each sale date"
            path={result.reinvested}
            currency={currency}
          />
        ) : null}
      </div>

      <WhatIfChart result={result} />

      <div className="whatif-subtitle">Every sale, priced today</div>
      <div className="intel-table-wrap">
        <table className="intel-table whatif-table">
          <thead>
            <tr>
              <th>Sold</th>
              <th>Shares</th>
              <th>Sold at</th>
              <th>Got</th>
              <th>Worth today</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {result.sales.map((sale, i) => (
              <tr key={`${sale.date}-${i}`}>
                <td className="muted tabular">{formatDate(sale.date)}</td>
                <td className="tabular">
                  {sale.quantity.toLocaleString("en-GB", { maximumFractionDigits: 4 })}
                  {restated(sale.quantity, sale.adjustedQuantity) ? (
                    <span className="muted">
                      {" → "}
                      {sale.adjustedQuantity.toLocaleString("en-GB", { maximumFractionDigits: 4 })}{" "}
                      today
                    </span>
                  ) : null}
                </td>
                <td className="tabular">
                  {money(sale.price, currency)}
                  {restated(sale.price, sale.adjustedPrice) ? (
                    <span className="muted"> ({money(sale.adjustedPrice, currency)} adj.)</span>
                  ) : null}
                </td>
                <td className="tabular">{money(sale.proceeds, currency)}</td>
                <td className="tabular">{money(sale.valueToday, currency)}</td>
                <td className={`tabular ${pnlClass(sale.missed)}`}>
                  {money(sale.missed, currency)}
                  {sale.missedPct != null ? (
                    <span className="muted"> {pct(sale.missedPct)}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="whatif-notes">
        {result.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function PathCard({
  id,
  label,
  detail,
  path,
  currency,
  highlight,
}: {
  id: PathId;
  label: string;
  detail: string;
  path: WhatIfPath;
  currency: string;
  highlight?: boolean;
}) {
  return (
    <div className={`whatif-card ${highlight ? "whatif-card-highlight" : ""}`}>
      <div className="whatif-card-label">
        <span className="whatif-swatch" style={{ background: PATH_COLORS[id] }} aria-hidden="true" />
        {label}
      </div>
      <div className="whatif-card-value tabular">{money(path.totalValue, currency)}</div>
      <div className={`tabular ${pnlClass(path.totalPnl)}`}>
        {money(path.totalPnl, currency)} · {pct(path.returnPct)}
      </div>
      <div className="muted whatif-card-detail">{detail}</div>
    </div>
  );
}

function WhatIfChart({ result }: { result: WhatIfResult }) {
  const series = result.series;
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const w = 660;
    const h = 260;
    const pad = { l: 46, r: 14, t: 14, b: 26 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const values: number[] = [];
    for (const p of series) {
      values.push(p.actual, p.neverSold, p.invested);
      if (p.reinvested != null) values.push(p.reinvested);
    }
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) => pad.l + (i / (series.length - 1)) * innerW;
    const y = (v: number) => pad.t + innerH - ((v - min) / span) * innerH;

    const path = (pick: (p: WhatIfPoint) => number | null) => {
      let d = "";
      let penDown = false;
      series.forEach((p, i) => {
        const v = pick(p);
        if (v == null) {
          penDown = false;
          return;
        }
        d += `${penDown ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        penDown = true;
      });
      return d.trim();
    };

    const ticks = [min, min + span / 2, max];
    const yearMarks: Array<{ i: number; label: string }> = [];
    let lastYear = "";
    series.forEach((p, i) => {
      const year = String(new Date(p.time * 1000).getUTCFullYear());
      if (year !== lastYear) {
        yearMarks.push({ i, label: year });
        lastYear = year;
      }
    });

    return { w, h, pad, innerH, x, y, path, ticks, yearMarks };
  }, [series]);

  if (!geometry) return null;

  const active = hover != null ? series[hover] : series[series.length - 1];
  if (!active) return null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const g = geometry;
    if (!g) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = ((e.clientX - rect.left) / rect.width) * g.w;
    const t = (ratio - g.pad.l) / (g.w - g.pad.l - g.pad.r);
    const i = Math.round(t * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  }

  return (
    <figure className="pnl-chart whatif-chart">
      <figcaption>
        <div>
          <div className="pnl-chart-title">Value of the two paths</div>
          <div className="muted">
            {formatDate(new Date(active.time * 1000).toISOString())} · same buys, one keeps the shares
          </div>
        </div>
        <div className="whatif-readout">
          <span style={{ color: PATH_COLORS.actual }}>
            {moneyShort(active.actual, result.currency)}
          </span>
          <span style={{ color: PATH_COLORS.neverSold }}>
            {moneyShort(active.neverSold, result.currency)}
          </span>
          {active.reinvested != null ? (
            <span style={{ color: PATH_COLORS.reinvested }}>
              {moneyShort(active.reinvested, result.currency)}
            </span>
          ) : null}
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${geometry.w} ${geometry.h}`}
        role="img"
        aria-label={`Value if held versus value after selling, ${result.symbol}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {geometry.ticks.map((t) => (
          <g key={t}>
            <line
              x1={geometry.pad.l}
              x2={geometry.w - geometry.pad.r}
              y1={geometry.y(t)}
              y2={geometry.y(t)}
              className="pnl-chart-grid"
            />
            <text
              x={geometry.pad.l - 6}
              y={geometry.y(t) + 3}
              className="pnl-chart-axis"
              textAnchor="end"
            >
              {moneyShort(t, result.currency)}
            </text>
          </g>
        ))}

        {geometry.yearMarks.map((mark) => (
          <text
            key={mark.label}
            x={geometry.x(mark.i)}
            y={geometry.h - 8}
            className="pnl-chart-axis"
            textAnchor="middle"
          >
            {mark.label}
          </text>
        ))}

        <path d={geometry.path((p) => p.invested)} className="whatif-line-invested" />
        {series.some((p) => p.reinvested != null) ? (
          <path
            d={geometry.path((p) => p.reinvested)}
            className="whatif-line"
            stroke={PATH_COLORS.reinvested}
          />
        ) : null}
        <path
          d={geometry.path((p) => p.neverSold)}
          className="whatif-line"
          stroke={PATH_COLORS.neverSold}
        />
        <path
          d={geometry.path((p) => p.actual)}
          className="whatif-line"
          stroke={PATH_COLORS.actual}
        />

        {hover != null ? (
          <line
            x1={geometry.x(hover)}
            x2={geometry.x(hover)}
            y1={geometry.pad.t}
            y2={geometry.pad.t + geometry.innerH}
            className="whatif-guide"
          />
        ) : null}
      </svg>

      <div className="whatif-legend">
        <LegendKey color={PATH_COLORS.actual} label="What you did" />
        <LegendKey color={PATH_COLORS.neverSold} label="Never sold" />
        {result.reinvested ? (
          <LegendKey color={PATH_COLORS.reinvested} label={`Proceeds into ${result.reinvested.label}`} />
        ) : null}
        <LegendKey color="var(--text-muted)" label="Cash invested" dashed />
      </div>
    </figure>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="whatif-legend-key">
      <span
        className="whatif-swatch"
        style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
