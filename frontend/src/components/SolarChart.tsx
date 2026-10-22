import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);

export function SolarChart({
  option,
  label,
  className = "",
}: {
  option: EChartsOption;
  label: string;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current, undefined, { renderer: "svg" });
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    instance.current?.setOption(
      {
        animation: !window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        textStyle: { fontFamily: "Segoe UI, sans-serif", color: "#52657a" },
        aria: { enabled: true, label: { description: label } },
        ...option,
      },
      { notMerge: true },
    );
  }, [option, label]);
  return (
    <div
      ref={element}
      className={`solar-chart ${className}`}
      role="img"
      aria-label={label}
    />
  );
}
