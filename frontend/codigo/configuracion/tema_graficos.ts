import type { EChartsOption } from "echarts";

export const chartBase: EChartsOption = {
  color: ["#b97b00", "#136b99", "#297c8c"],
  grid: { left: 58, right: 22, top: 44, bottom: 50 },
  tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
  legend: {
    top: 0,
    left: 0,
    itemWidth: 16,
    itemHeight: 8,
    textStyle: { color: "#4c6679" },
  },
  xAxis: {
    type: "category",
    axisLine: { lineStyle: { color: "#dce3eb" } },
    axisTick: { show: false },
    axisLabel: { color: "#4c6679", fontSize: 11 },
  },
  yAxis: {
    type: "value",
    name: "kWh",
    nameTextStyle: { color: "#4c6679" },
    splitLine: { lineStyle: { color: "#eaf0f4" } },
  },
};
