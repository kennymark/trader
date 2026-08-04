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

export function PriceChart({ bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#8aa094",
        fontFamily: "IBM Plex Mono, monospace",
      },
      grid: {
        vertLines: { color: "rgba(36,51,44,0.6)" },
        horzLines: { color: "rgba(36,51,44,0.6)" },
      },
      rightPriceScale: { borderColor: "#24332c" },
      timeScale: { borderColor: "#24332c" },
      crosshair: {
        vertLine: { color: "#2d6b4f" },
        horzLine: { color: "#2d6b4f" },
      },
      autoSize: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#7cffb2",
      topColor: "rgba(124, 255, 178, 0.35)",
      bottomColor: "rgba(124, 255, 178, 0.02)",
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
