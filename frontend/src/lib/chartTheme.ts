import type { EChartsOption } from "echarts";

export const chartBase: EChartsOption = {
  color: ["#d18b16", "#2877a3", "#188476"],
  grid: { left: 58, right: 22, top: 44, bottom: 50 },
  tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
  legend: {
    top: 0,
    left: 0,
    itemWidth: 16,
    itemHeight: 8,
    textStyle: { color: "#52657a" },
  },
  xAxis: {
    type: "category",
    axisLine: { lineStyle: { color: "#dce3eb" } },
    axisTick: { show: false },
    axisLabel: { color: "#52657a", fontSize: 11 },
  },
  yAxis: {
    type: "value",
    name: "kWh",
    nameTextStyle: { color: "#52657a" },
    splitLine: { lineStyle: { color: "#edf1f6" } },
  },
};
