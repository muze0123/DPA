import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

export const chartThemeColors = {
  light: {
    series: [
      "#005BF5",
      "#0E7C8A",
      "#C25400",
      "#8B5CF6",
      "#00913A",
      "#E5308C",
      "#7A4E00",
      "#5B7083",
    ],
    text: "#666666",
    grid: "#EEEEEE",
    axis: "#DDDDDD",
    tooltip: "#FFFFFF",
    tooltipText: "#333333",
  },
  dark: {
    series: [
      "#6FA5FF",
      "#1DE4F3",
      "#FF9A4D",
      "#B18AFF",
      "#3FD15F",
      "#FF6FB0",
      "#D9A441",
      "#A8B2C0",
    ],
    text: "#9CA0A8",
    grid: "#2E3138",
    axis: "#6E7684",
    tooltip: "#26282E",
    tooltipText: "#F2F3F5",
  },
} as const;

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

echarts.registerTheme("metritag", {
  color: [...chartThemeColors.light.series],
  textStyle: {
    fontFamily: "PingFang SC, -apple-system, sans-serif",
    color: "#666666",
    fontSize: 12,
  },
  title: { textStyle: { color: "#1A1C20", fontSize: 16, fontWeight: 600 } },
});

echarts.registerTheme("metritag-dark", {
  color: [...chartThemeColors.dark.series],
  textStyle: {
    fontFamily: "PingFang SC, -apple-system, sans-serif",
    color: "#9CA0A8",
    fontSize: 12,
  },
  title: { textStyle: { color: "#F2F3F5", fontSize: 16, fontWeight: 600 } },
});
