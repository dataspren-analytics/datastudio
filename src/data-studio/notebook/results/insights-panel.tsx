"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BarChart3, Check, ChevronDown, LineChart, PieChart, ScatterChart, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  type AggregationType,
  type TableData,
  type VisualizeChartType,
  type VisualizeConfig,
} from "../../runtime";
import { computeEffectiveVizConfig, computeNeedsAggregation } from "./viz-utils";

// ─── EChart (lazy-loaded) ──────────────────────────────────────────────

function EChart({ options, style }: { options: Record<string, unknown>; style?: React.CSSProperties }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<{ setOption: (o: Record<string, unknown>, notMerge?: boolean) => void; resize: () => void; dispose: () => void } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      const chart = echarts.init(el);
      chart.setOption(options);
      if (disposed) { chart.dispose(); return; }
      instanceRef.current = chart;
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(el);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instanceRef.current?.setOption(options, true);
  }, [options]);

  return <div ref={containerRef} style={style} />;
}

// ─── Constants ─────────────────────────────────────────────────────────

const visualizeChartTypes: { type: VisualizeChartType; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
  { type: "bar", icon: BarChart3, label: "Bar" },
  { type: "line", icon: LineChart, label: "Line" },
  { type: "area", icon: TrendingUp, label: "Area" },
  { type: "scatter", icon: ScatterChart, label: "Scatter" },
  { type: "pie", icon: PieChart, label: "Pie" },
];

const aggregationLabels: Record<AggregationType, string> = {
  sum: "Sum",
  count: "Count",
  avg: "Average",
  min: "Min",
  max: "Max",
};

// ─── Chart Options Builder ────────────────────────────────────────────

function buildChartOptions(
  vizData: TableData,
  config: VisualizeConfig,
  isDark: boolean,
): Record<string, unknown> | null {
  const { chartType, xColumn, yColumns } = config;
  if (!xColumn || yColumns.length === 0) return null;

  const palette = [
    "#eb4300", "#4a9eff", "#50e3c2", "#ff4ab0", "#f5a623",
    "#bd10e0", "#7ed321", "#9013fe", "#4a90d9", "#f8e71c",
  ];

  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const axisLineColor = isDark ? "#3f3f46" : "#d4d4d8";
  const splitLineColor = isDark ? "rgba(63,63,70,0.5)" : "rgba(228,228,231,0.8)";
  const animation = false;

  const baseXAxis = {
    type: "category" as const,
    name: xColumn,
    nameLocation: "center" as const,
    nameGap: 30,
    nameTextStyle: { color: textColor, fontSize: 11 },
    axisLine: { show: true, lineStyle: { color: axisLineColor } },
    axisTick: { show: true, lineStyle: { color: axisLineColor } },
    axisLabel: { color: textColor, fontSize: 10 },
    splitLine: { show: false },
  };

  const baseYAxis = {
    type: "value" as const,
    name: yColumns.length === 1 ? yColumns[0] : undefined,
    nameLocation: "center" as const,
    nameGap: 45,
    nameTextStyle: { color: textColor, fontSize: 11 },
    axisLine: { show: true, lineStyle: { color: axisLineColor } },
    axisTick: { show: true, lineStyle: { color: axisLineColor } },
    axisLabel: { color: textColor, fontSize: 10 },
    splitLine: { show: true, lineStyle: { color: splitLineColor, type: "dashed" as const } },
  };

  const baseGrid = { left: 60, right: 24, top: 24, bottom: 48, containLabel: false };

  const tooltipStyle = {
    backgroundColor: isDark ? "#27272a" : "#fff",
    borderColor: isDark ? "#3f3f46" : "#e4e4e7",
    textStyle: { color: isDark ? "#e4e4e7" : "#27272a", fontSize: 12 },
  };

  const fmt = (v: number) => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v;

  const tooltip = {
    trigger: "axis" as const,
    ...tooltipStyle,
    formatter: (params: Array<{ marker: string; seriesName: string; value: number }>) => {
      if (!Array.isArray(params) || params.length === 0) return "";
      const xVal = (params[0] as unknown as { axisValueLabel: string }).axisValueLabel;
      const header = `<div style="font-weight:600;margin-bottom:4px">${xColumn}: ${xVal}</div>`;
      const rows = params.map((p) => `<div>${p.marker} ${p.seriesName}: <b>${fmt(p.value)}</b></div>`).join("");
      return header + rows;
    },
  };

  const scatterTooltip = {
    trigger: "item" as const,
    ...tooltipStyle,
    formatter: (p: { marker: string; seriesName: string; data: [string | number, number] }) =>
      `${p.marker} <b>${p.seriesName}</b><br/>${xColumn}: ${p.data[0]}<br/>${yColumns[0]}: <b>${fmt(p.data[1])}</b>`,
  };

  const legend = yColumns.length > 1 ? {
    show: true,
    top: 0,
    textStyle: { color: textColor, fontSize: 11 },
  } : undefined;

  const makeSeries = (yCol: string, data: number[]) => ({
    type: chartType === "area" ? "line" : chartType,
    name: yCol,
    data,
    ...(chartType === "area" ? { areaStyle: { opacity: 0.15 } } : {}),
    ...(chartType === "bar" ? { barMaxWidth: 40, itemStyle: { borderRadius: [2, 2, 0, 0] } } : {}),
    ...(chartType === "scatter" ? { symbolSize: 6 } : {}),
  });

  if (chartType === "pie") {
    const pieTooltip = {
      trigger: "item" as const,
      ...tooltipStyle,
      formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
        `<b>${xColumn}: ${p.name}</b><br/>${yColumns[0]}: <b>${fmt(p.value)}</b> (${p.percent}%)`,
    };
    const pieData = vizData.map((row) => ({ name: String(row[xColumn] ?? ""), value: Number(row[yColumns[0]] ?? 0) }));
    return {
      animation,
      backgroundColor: "transparent",
      color: palette,
      tooltip: pieTooltip,
      legend: { show: true, bottom: 0, textStyle: { color: textColor, fontSize: 11 }, formatter: (name: string) => `${xColumn}: ${name}` },
      series: [{
        type: "pie",
        radius: ["30%", "60%"],
        center: ["50%", "45%"],
        data: pieData,
        label: {
          show: true,
          color: textColor,
          fontSize: 11,
          formatter: (p: { name: string; percent: number }) => `${xColumn}: ${p.name}\n${p.percent}%`,
        },
        labelLine: { show: true, lineStyle: { color: axisLineColor } },
        itemStyle: { borderColor: isDark ? "#18181b" : "#fff", borderWidth: 2 },
      }],
    };
  }

  if (chartType === "scatter") {
    return {
      animation,
      backgroundColor: "transparent",
      color: palette,
      grid: legend ? { ...baseGrid, top: 36 } : baseGrid,
      xAxis: { ...baseXAxis, data: vizData.map((row) => String(row[xColumn] ?? "")) },
      yAxis: baseYAxis,
      dataZoom: [{ type: "inside" }],
      tooltip: scatterTooltip,
      legend,
      series: yColumns.map((yCol) => ({
        type: "scatter" as const,
        name: yCol,
        data: vizData.map((row) => [String(row[xColumn] ?? ""), Number(row[yCol] ?? 0)]),
        symbolSize: 6,
      })),
    };
  }

  return {
    animation,
    backgroundColor: "transparent",
    color: palette,
    grid: legend ? { ...baseGrid, top: 36 } : baseGrid,
    xAxis: { ...baseXAxis, data: vizData.map((row) => String(row[xColumn] ?? "")) },
    yAxis: baseYAxis,
    dataZoom: [{ type: "inside" }],
    tooltip,
    legend,
    series: yColumns.map((yCol) => makeSeries(yCol, vizData.map((row) => Number(row[yCol] ?? 0)))),
  };
}

// ─── InsightsPanel (pure renderer) ────────────────────────────────────

export interface InsightsPanelProps {
  tableData: TableData | null;
  vizConfig: VisualizeConfig | undefined;
  vizData: TableData | null;
  isDark: boolean;
  onUpdateVisualizeConfig?: (config: VisualizeConfig) => void;
  onRefreshVizData?: (config: VisualizeConfig) => void;
}

export function InsightsPanel({ tableData, vizConfig, vizData, isDark, onUpdateVisualizeConfig, onRefreshVizData }: InsightsPanelProps) {
  const tableColumns = useMemo(() => {
    if (!tableData || tableData.length === 0) return [];
    return Object.keys(tableData[0]);
  }, [tableData]);

  const effectiveVizConfig = useMemo(
    () => computeEffectiveVizConfig(tableData, vizConfig),
    [tableData, vizConfig],
  );

  const needsAggregation = useMemo(
    () => computeNeedsAggregation(tableData, effectiveVizConfig),
    [tableData, effectiveVizConfig],
  );

  const resolvedVizData = vizData ?? tableData;

  const chartOptions = useMemo(() => {
    if (!effectiveVizConfig || !resolvedVizData || resolvedVizData.length === 0) return null;
    return buildChartOptions(resolvedVizData, effectiveVizConfig, isDark);
  }, [effectiveVizConfig, resolvedVizData, isDark]);

  if (!tableData) {
    return (
      <div className="text-sm text-neutral-400 dark:text-neutral-500 py-8 text-center">
        Run the query to see insights.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      {/* Config bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Chart type buttons — no refresh needed, just re-renders */}
        <div className="flex items-center rounded-md border border-neutral-200 dark:border-border overflow-hidden">
          {visualizeChartTypes.map(({ type, icon: Icon, label }) => {
            const isActive = (effectiveVizConfig?.chartType || "bar") === type;
            return (
              <button
                key={type}
                onClick={() => {
                  const updated = { ...(effectiveVizConfig || { chartType: "bar", xColumn: "", yColumns: [] }), chartType: type };
                  onUpdateVisualizeConfig?.(updated);
                }}
                className={cn(
                  "flex items-center gap-1 p-1.5 transition-colors",
                  isActive
                    ? "bg-neutral-200 dark:bg-accent text-neutral-950 dark:text-foreground"
                    : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent/50",
                )}
                title={label}
              >
                <Icon size={14} />
                {isActive && <span className="text-[11px] font-medium pr-0.5">{label}</span>}
              </button>
            );
          })}
        </div>

        {/* X column */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-200">X</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0">
                <span className="truncate">{effectiveVizConfig?.xColumn || tableColumns[0]}</span>
                <ChevronDown size={10} className="opacity-50 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {tableColumns.map((col) => (
                <DropdownMenuItem key={col} onClick={() => {
                  const updated = { ...(effectiveVizConfig || { chartType: "bar" as const, xColumn: "", yColumns: [] }), xColumn: col };
                  onUpdateVisualizeConfig?.(updated);
                  onRefreshVizData?.(updated);
                }} className="text-xs">
                  <span>{col}</span>
                  {(effectiveVizConfig?.xColumn || tableColumns[0]) === col && <Check size={12} className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Y column */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-200">Y</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0">
                <span className="truncate">{effectiveVizConfig?.yColumns[0] || tableColumns[0]}</span>
                <ChevronDown size={10} className="opacity-50 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {tableColumns.map((col) => (
                <DropdownMenuItem key={col} onClick={() => {
                  const updated = { ...(effectiveVizConfig || { chartType: "bar" as const, xColumn: "", yColumns: [] }), yColumns: [col] };
                  onUpdateVisualizeConfig?.(updated);
                  onRefreshVizData?.(updated);
                }} className="text-xs">
                  <span>{col}</span>
                  {(effectiveVizConfig?.yColumns[0] || tableColumns[0]) === col && <Check size={12} className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Aggregation */}
        {needsAggregation && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-200">Agg</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0">
                  <span className="truncate">{aggregationLabels[(effectiveVizConfig?.aggregation || "sum") as AggregationType]}</span>
                  <ChevronDown size={10} className="opacity-50 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(Object.keys(aggregationLabels) as AggregationType[]).map((agg) => (
                  <DropdownMenuItem key={agg} onClick={() => {
                    const updated = { ...(effectiveVizConfig || { chartType: "bar" as const, xColumn: "", yColumns: [] }), aggregation: agg as AggregationType };
                    onUpdateVisualizeConfig?.(updated);
                    onRefreshVizData?.(updated);
                  }} className="text-xs">
                    <span>{aggregationLabels[agg]}</span>
                    {(effectiveVizConfig?.aggregation || "sum") === agg && <Check size={12} className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

      </div>

      {/* Chart */}
      {chartOptions && (
        <div className="w-full" style={{ height: 340 }}>
          <EChart
            options={chartOptions}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
