import { useEffect, useRef } from "react";
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

/** Chart colours come from the stylesheet so the palette has one source of truth. */
function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    accent: read("--accent", "#6ea8fe"),
    accentRgb: read("--accent-rgb", "110 168 254"),
    accentDim: read("--accent-dim", "#24405f"),
    border: read("--border", "#232831"),
    grid: `rgb(${read("--border-strong", "#333a46")
      .replace("#", "")
      .match(/.{2}/g)!
      .map((h) => parseInt(h, 16))
      .join(" ")} / 0.4)`,
    muted: read("--text-muted", "#8b93a1"),
  };
}

export function PriceChart({ bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = readTheme();
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: theme.muted,
        fontFamily: "IBM Plex Mono, monospace",
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      crosshair: {
        vertLine: { color: theme.accentDim },
        horzLine: { color: theme.accentDim },
      },
      autoSize: true,
    });

    // Price is not profit, so it uses the interactive accent rather than green.
    const series = chart.addSeries(AreaSeries, {
      lineColor: theme.accent,
      topColor: `rgb(${theme.accentRgb} / 0.28)`,
      bottomColor: `rgb(${theme.accentRgb} / 0.02)`,
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

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

  return <div className="chart-el" ref={containerRef} />;
}
