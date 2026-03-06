"use client";

import { FileSpreadsheet, Loader2, Music, Plus, Power } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotebookCell } from "./runtime";
import { createNotebookFile } from "./runtime/notebook-utils";
import { useExecutionBackend, useRuntime } from "./provider/runtime-provider";
import { useAppStore, selectSelectFile } from "./store";

// ============================================================================
// Demo Config
// ============================================================================

interface DemoConfig {
  notebookUrl: string;
  baseName: string;
  dataFiles: { url: string; fileName: string }[];
}

const DEMOS: Record<string, DemoConfig> = {
  spotify: {
    notebookUrl: "https://r2.local.dataspren.com/demo-data/spotify-analysis/Spotify_Tracks_Analysis.ipynb",
    baseName: "Spotify Tracks Analysis",
    dataFiles: [
      { url: "https://r2.local.dataspren.com/demo-data/spotify-analysis/spotify_data.parquet", fileName: "spotify_data.parquet" },
    ],
  },
};

// ============================================================================
// Example Templates
// ============================================================================

interface DemoTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
}

const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: "spotify",
    title: "Spotify Tracks Analysis",
    description:
      "Explore 1 million Spotify tracks with audio features, popularity scores, and genre classifications. Includes SQL queries, Python visualizations, and interactive charts.",
    tags: ["SQL", "Python", "Charts"],
    icon: <Music size={20} />,
  },
];

// ============================================================================
// Lazy EChart (same pattern as insights-panel)
// ============================================================================

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
      const chart = echarts.init(el, "dark");
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

function SampleLineChart() {
  const options = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { top: 30, right: 20, bottom: 30, left: 50 },
    xAxis: {
      type: "category",
      data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      axisLine: { lineStyle: { color: "#525252" } },
      axisLabel: { color: "#a3a3a3", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: "#a3a3a3", fontSize: 11 },
      splitLine: { lineStyle: { color: "#2e2e2e" } },
    },
    series: [
      {
        data: [820, 932, 901, 1234, 1390, 1530, 1620, 1840, 1760, 1930, 2150, 2340],
        type: "line",
        smooth: true,
        lineStyle: { color: "#eb4300", width: 2 },
        itemStyle: { color: "#eb4300" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(235, 67, 0, 0.25)" },
              { offset: 1, color: "rgba(235, 67, 0, 0)" },
            ],
          },
        },
      },
    ],
    tooltip: { trigger: "axis" },
  }), []);

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      <EChart options={options} style={{ width: "100%", height: 220 }} />
    </div>
  );
}

// ============================================================================
// HomePage
// ============================================================================

export function HomePage() {
  const runtime = useRuntime();
  const execution = useExecutionBackend();
  const selectFile = useAppStore(selectSelectFile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const handleCloneDemo = useCallback(
    async (demoId: string) => {
      const demo = DEMOS[demoId];
      if (!demo) return;

      // Download notebook and data files in parallel
      const [notebookResponse] = await Promise.all([
        fetch(demo.notebookUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ...demo.dataFiles.map(async ({ url, fileName }) => {
          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const blob = await response.blob();
            await runtime.writeFile(new File([blob], fileName));
          } catch {
            // Data download failed, continue
          }
        }),
      ]);

      await runtime.refreshFiles();

      // Extract cells from the downloaded notebook, or fall back to empty
      const cells: NotebookCell[] = notebookResponse?.cells ?? [];

      // Derive existing names from dataFiles for deduplication
      const existingNames = runtime.dataFiles
        .filter((f) => f.path.endsWith(".ipynb"))
        .map((f) => f.name.replace(".ipynb", "").replace(/_/g, " "));
      const existingCount = existingNames.filter((n) => n.startsWith(demo.baseName)).length;
      const name = existingCount === 0 ? demo.baseName : `${demo.baseName} ${existingCount + 1}`;

      const filePath = await createNotebookFile(execution, { name, cells, existingNames });
      await runtime.refreshFiles();
      selectFile(filePath);
    },
    [runtime, execution, selectFile],
  );

  const handleCreateNotebook = useCallback(async () => {
    const existingNames = runtime.dataFiles
      .filter((f) => f.path.endsWith(".ipynb"))
      .map((f) => f.name.replace(".ipynb", "").replace(/_/g, " "));
    const filePath = await createNotebookFile(execution, { existingNames });
    await runtime.refreshFiles();
    selectFile(filePath);
  }, [runtime, execution, selectFile]);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await runtime.writeFile(file);
      }
      await runtime.refreshFiles();
      selectFile(null);
    },
    [runtime, selectFile],
  );

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleUploadFiles(Array.from(files));
      }
      e.target.value = "";
    },
    [handleUploadFiles],
  );

  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-background">
      <article className="max-w-2xl mx-auto px-8 py-12">
        {/* Title */}
        <h1 className="text-[28px] font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
          Welcome to Data Studio
        </h1>
        <p className="mt-3 text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Analyze data with SQL and Python in an interactive notebook.
        </p>
        <p className="mt-1 text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Drag and drop files into the sidebar (CSV, Parquet, JSON, Excel, etc.) to get started.
        </p>

        {/* Get Started */}
        <h2 className="mt-10 mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Get Started
        </h2>
        <div className="flex gap-3">
          <button
            onClick={handleCreateNotebook}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <Plus size={16} />
            New Notebook
          </button>
          <button
            onClick={handleUploadClick}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <FileSpreadsheet size={16} />
            Upload Data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.parquet,.json,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Example Notebooks */}
        <h2 className="mt-12 mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Example Notebooks
        </h2>
        <div className="flex flex-col gap-3">
          {DEMO_TEMPLATES.map((demo) => (
            <div
              key={demo.id}
              className="group flex items-start gap-4 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 shrink-0">
                {demo.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {demo.title}
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {demo.description}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {demo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                disabled={cloningId !== null}
                onClick={async () => {
                  setCloningId(demo.id);
                  try {
                    await handleCloneDemo(demo.id);
                  } finally {
                    setCloningId(null);
                  }
                }}
                className="flex items-center gap-1.5 shrink-0 self-center px-3 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cloningId === demo.id && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                Clone (80MB)
              </button>
            </div>
          ))}
        </div>

        {/* File Viewers */}
        <h2 className="mt-12 mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          File Viewers
        </h2>
        <p className="text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Click any file in the sidebar to open it in a dedicated viewer with sorting, search, and schema inspection.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { fmt: "CSV", ext: ".csv", color: "text-emerald-500 dark:text-emerald-400" },
            { fmt: "Parquet", ext: ".parquet", color: "text-blue-500 dark:text-blue-400" },
            { fmt: "JSON", ext: ".json", color: "text-amber-500 dark:text-amber-400" },
            { fmt: "Excel", ext: ".xlsx / .xls", color: "text-green-600 dark:text-green-400" },
          ].map(({ fmt, ext, color }) => (
            <div key={fmt} className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/50 dark:border-neutral-700/50">
              <p className={`text-sm font-semibold ${color}`}>{fmt}</p>
              <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">{ext}</p>
            </div>
          ))}
        </div>

        {/* Query & Transform with SQL */}
        <h2 className="mt-12 mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Query &amp; Transform with SQL
        </h2>
        <p className="text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Create a <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[13px] font-mono">%sql</code> cell and query files directly by path, no import step needed. Powered by DuckDB.
          The query below materializes as view and can be accessed in other SQL cells or Python cells as dataframe.
        </p>
        <pre className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
          <code>
            <span className="text-brand">%sql</span>{"\n"}
            <span className="text-brand">SELECT</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> department, </span>
            <span className="text-brand">SUM</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">(revenue)</span>{"\n"}
            <span className="text-brand">FROM</span>
            <span className="text-[#986801] dark:text-[#e5c07b]"> &apos;/mnt/local/sales_report.xlsx&apos;</span>{"\n"}
            <span className="text-brand">GROUP BY</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> department</span>
          </code>
        </pre>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-500 leading-relaxed">
          Works with CSV, Parquet, JSON, and Excel. Filter, join across files, aggregate, and export results.
        </p>

        {/* Interactive Visualizations */}
        <h2 className="mt-12 mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Interactive Visualizations
        </h2>
        <p className="text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Every SQL cell has a built-in <strong>Insights</strong> tab. Pick a chart type and map columns, no code required. Powered by ECharts.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Bar", "Line", "Area", "Scatter", "Pie"].map((chart) => (
            <span key={chart} className="px-2.5 py-1 text-xs rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
              {chart}
            </span>
          ))}
        </div>
        <pre className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
          <code>
            <span className="text-brand">%sql</span>{"\n"}
            <span className="text-brand">SELECT</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> month, </span>
            <span className="text-brand">SUM</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">(amount) </span>
            <span className="text-brand">AS</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> total</span>{"\n"}
            <span className="text-brand">FROM</span>
            <span className="text-[#986801] dark:text-[#e5c07b]"> &apos;/mnt/local/transactions.csv&apos;</span>{"\n"}
            <span className="text-brand">GROUP BY</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> month </span>
            <span className="text-brand">ORDER BY</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> month</span>
          </code>
        </pre>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-500 leading-relaxed">
          Then open the Insights tab, pick Line chart, set x to month and y to total.
        </p>
        <SampleLineChart />

        {/* Data Quality Tests */}
        <h2 className="mt-12 mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Data Quality Tests
        </h2>
        <p className="text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Each SQL cell has a <strong>Tests</strong> tab for dbt-style assertions. Add tests to any column and they run automatically when the cell executes.
        </p>

        {/* Mock test panel */}
        <div className="mt-4 rounded-lg border border-neutral-200/50 dark:border-neutral-700/50 overflow-hidden">
          <div className="space-y-1.5 p-3">
            {[
              { type: "Not Null", column: "track_id", passed: true },
              { type: "Unique", column: "track_id", passed: true },
              { type: "Accepted Values", column: "genre", passed: false },
            ].map((test, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/50 dark:border-neutral-700/30">
                <span className="text-emerald-500 shrink-0"><Power size={10} /></span>
                <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${test.passed ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                  {test.passed ? "PASS" : "FAILED"}
                </span>
                <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">{test.type}</span>
                <code className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">{test.column}</code>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500 leading-relaxed">
          Built-in test types: <strong className="text-neutral-600 dark:text-neutral-400">Unique</strong>, <strong className="text-neutral-600 dark:text-neutral-400">Not Null</strong>, <strong className="text-neutral-600 dark:text-neutral-400">Accepted Values</strong>, and <strong className="text-neutral-600 dark:text-neutral-400">Custom SQL</strong> for arbitrary validation queries.
        </p>

        {/* Python & Matplotlib */}
        <h2 className="mt-12 mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Python &amp; Matplotlib
        </h2>
        <p className="text-base text-neutral-600 dark:text-neutral-200 leading-relaxed">
          Use pandas, matplotlib, and any Pyodide-supported library. SQL views are automatically available as DataFrames.
        </p>
        <pre className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
          <code>
            <span className="text-brand">import</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> matplotlib.pyplot </span>
            <span className="text-brand">as</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]"> plt</span>{"\n"}
            {"\n"}
            <span className="text-neutral-400 dark:text-neutral-500"># &apos;sales&apos; is a SQL view, automatically a DataFrame</span>{"\n"}
            <span className="text-neutral-700 dark:text-[#e0e0e0]">sales.groupby(</span>
            <span className="text-[#986801] dark:text-[#e5c07b]">&apos;region&apos;</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">)[</span>
            <span className="text-[#986801] dark:text-[#e5c07b]">&apos;revenue&apos;</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">].sum().plot(kind=</span>
            <span className="text-[#986801] dark:text-[#e5c07b]">&apos;barh&apos;</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">)</span>{"\n"}
            <span className="text-neutral-700 dark:text-[#e0e0e0]">plt.title(</span>
            <span className="text-[#986801] dark:text-[#e5c07b]">&apos;Revenue by Region&apos;</span>
            <span className="text-neutral-700 dark:text-[#e0e0e0]">)</span>{"\n"}
            <span className="text-neutral-700 dark:text-[#e0e0e0]">plt.show()</span>
          </code>
        </pre>
      </article>
    </div>
  );
}
