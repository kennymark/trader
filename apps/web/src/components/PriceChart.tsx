import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { HistoryBar } from "@trader/shared";

type Props = {
  bars: HistoryBar[];
};

type Hover = { x: number; y: number; price: number; label: string } | null;

/** Chart colours come from the stylesheet so the palette has one source of truth. */
function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--ink", "#f2f3f5"),
    inkRgb: read("--accent-rgb", "242 243 245"),
    muted: read("--text-muted", "#9aa1ab"),
    border: read("--border", "#3a3f47"),
  };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** dd MMM yy, matching the date format used everywhere else in the app. */
function formatStamp(time: Time): string {
  const seconds = typeof time === "number" ? time : Number(time);
  if (!Number.isFinite(seconds)) return "";
  const d = new Date(seconds * 1000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

export function PriceChart({ bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = readTheme();
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: theme.muted,
        fontFamily: "Public Sans, system-ui, sans-serif",
        // The vendor watermark is not part of this design system.
        attributionLogo: false,
      },
      // No grid and no chart background: the line is the only thing drawn.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: theme.border, width: 1, style: 3, labelVisible: false },
        horzLine: { color: theme.border, width: 1, style: 3, labelVisible: false },
      },
      autoSize: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: theme.ink,
      topColor: `rgb(${theme.inkRgb} / 0.10)`,
      bottomColor: `rgb(${theme.inkRgb} / 0)`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // The reading a statement owes you: the exact figure under the pointer.
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const point = param.seriesData.get(series) as { value?: number } | undefined;
      if (!point || point.value == null) {
        setHover(null);
        return;
      }
      setHover({
        x: param.point.x,
        y: param.point.y,
        price: point.value,
        label: formatStamp(param.time),
      });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: containerRef.current?.clientWidth,
        height: containerRef.current?.clientHeight,
      });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.close,
      })),
    );
    chartRef.current.timeScale().fitContent();
  }, [bars]);

  const width = containerRef.current?.clientWidth ?? 0;
  const flip = hover != null && width > 0 && hover.x > width - 170;

  return (
    <div className="chart-el" ref={containerRef} onMouseLeave={() => setHover(null)}>
      {hover ? (
        <div
          className="chart-readout"
          style={{
            left: hover.x,
            top: hover.y,
            transform: `translate(${flip ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <span className="chart-readout-price tabular">
            {hover.price.toLocaleString("en-GB", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="chart-readout-date">{hover.label}</span>
        </div>
      ) : null}
    </div>
  );
}
