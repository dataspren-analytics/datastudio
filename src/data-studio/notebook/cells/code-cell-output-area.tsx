"use client";

import { cn } from "@/lib/utils";
import { memo, useCallback, useMemo, useState } from "react";
import {
  extractAssertResults,
  extractTableData,
  getCellType,
  type AssertTest,
  type CodeCell as CodeCellType,
  type TableData,
  type VisualizeConfig,
} from "../../runtime";
import { useStore, selectIsDarkMode } from "../store";
import { useRuntime } from "../../provider/runtime-provider";
import { useCellOutputData } from "../hooks/use-cell-output";
import { useCellActions } from "../hooks/use-cell-actions";
import { CellOutput } from "../results/cell-output";
import { InsightsPanel } from "../results/insights-panel";
import { TestPanel } from "../results/test-panel";

interface CodeCellOutputAreaProps {
  id: string;
  cellType: "python" | "sql";
}

export const CodeCellOutputArea = memo(function CodeCellOutputArea({
  id,
  cellType,
}: CodeCellOutputAreaProps) {
  const data = useCellOutputData(id);
  const actions = useCellActions();
  const runtime = useRuntime();
  const isDark = useStore(selectIsDarkMode);

  const isSQL = cellType === "sql";

  const savedTab = data.activeTab;
  const [activeTab, setActiveTab] = useState<"results" | "tests" | "insights">(
    savedTab === "tests" || savedTab === "insights" ? savedTab : "results",
  );

  const handleSetActiveTab = useCallback(
    (tab: "results" | "tests" | "insights") => {
      setActiveTab(tab);
      actions.updateCellMetadata(id, { activeTab: tab });
    },
    [actions, id],
  );

  const assertConfig = data.assertConfig || { tests: [] };
  const assertResults = useMemo(
    () => extractAssertResults(data.outputs) || [],
    [data.outputs],
  );

  const allTestsPassed =
    assertResults.length > 0 && assertResults.every((r) => r.passed);
  const anyTestsFailed = assertResults.some((r) => !r.passed);
  const hasTests = assertConfig.tests.length > 0;

  const hasError = data.outputs.some((o) => o.output_type === "error");

  const tableData = useMemo(
    () => extractTableData(data.outputs) ?? null,
    [data.outputs],
  );

  const errorMessage = useMemo(() => {
    const errorOutput = data.outputs.find((o) => o.output_type === "error");
    return errorOutput?.output_type === "error" ? errorOutput.evalue : null;
  }, [data.outputs]);

  const hasOutput =
    data.outputs.length > 0 || data.isQueued || data.isRunning;
  const showOutputArea = hasOutput || (isSQL && hasTests);

  // Build a minimal cell-like object for CellOutput (which expects a CodeCell)
  const cellForOutput = useMemo(
    (): CodeCellType => ({
      id,
      cell_type: "code",
      source: [], // Not used by CellOutput
      outputs: data.outputs,
      execution_count: null, // Not used by CellOutput
      metadata: {
        viewName: data.viewName,
      },
    }),
    [id, data.outputs, data.viewName],
  );

  const handleUpdateAssertConfig = useCallback(
    (config: { tests: AssertTest[] }) =>
      actions.updateAssertConfig(id, config),
    [actions, id],
  );

  const handleRunTests = useCallback(
    () => actions.runCellTests(id),
    [actions, id],
  );

  const handleUpdateMetadata = useCallback(
    (metadata: Record<string, unknown>) =>
      actions.updateCellMetadata(id, metadata),
    [actions, id],
  );

  const handleRefreshVizData = useCallback(
    (config: VisualizeConfig) => actions.refreshVizData(id, config),
    [actions, id],
  );

  if (!showOutputArea) return null;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-muted/50 overflow-hidden rounded-b-lg">
      {isSQL && (
        <div
          className="flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleSetActiveTab("results")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              activeTab === "results"
                ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
            )}
          >
            Results
          </button>
          <button
            onClick={() => handleSetActiveTab("insights")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              activeTab === "insights"
                ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
            )}
          >
            Insights
          </button>
          <button
            onClick={() => handleSetActiveTab("tests")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5",
              activeTab === "tests"
                ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
            )}
          >
            Tests
            {hasTests && (
              <span
                className={cn(
                  "text-[10px] px-1 py-px rounded",
                  assertResults.length === 0
                    ? "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                    : allTestsPassed
                      ? "bg-emerald-500/10 text-emerald-500"
                      : anyTestsFailed
                        ? "bg-red-500/10 text-red-500"
                        : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
                )}
              >
                {assertConfig.tests.length}
              </span>
            )}
          </button>
        </div>
      )}

      {isSQL && errorMessage && activeTab !== "results" && (
        <pre className="text-sm font-mono text-red-500 dark:text-red-400 whitespace-pre px-3 py-2 overflow-x-auto w-0 min-w-full border-b border-red-200/50 dark:border-red-900/30">
          {errorMessage}
        </pre>
      )}

      {(!isSQL || activeTab === "results") && (
        <CellOutput
          cell={cellForOutput}
          isQueued={data.isQueued}
          isRunning={data.isRunning}
          visibleRows={data.visibleRows}
          onChangeVisibleRows={(rows) =>
            handleUpdateMetadata({ visibleRows: rows })
          }
        />
      )}

      {isSQL && activeTab === "insights" && (
        <InsightsPanel
          tableData={tableData}
          vizConfig={data.visualizeConfig}
          vizData={data.visualizeData}
          isDark={isDark}
          onUpdateVisualizeConfig={(config) =>
            handleUpdateMetadata({ visualizeConfig: config })
          }
          onRefreshVizData={handleRefreshVizData}
        />
      )}

      {isSQL && activeTab === "tests" && (
        <TestPanel
          assertConfig={assertConfig}
          assertResults={assertResults}
          tables={runtime.tables ?? []}
          viewName={data.viewName}
          isRunning={data.isRunning}
          isRuntimeReady={runtime.isReady}
          isDark={isDark}
          onUpdateAssertConfig={handleUpdateAssertConfig}
          onRunTests={handleRunTests}
        />
      )}
    </div>
  );
});
