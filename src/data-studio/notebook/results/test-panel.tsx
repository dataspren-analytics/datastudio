"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Check, ChevronDown, ChevronRight, Plus, Power, X } from "lucide-react";
import { useCallback, useState } from "react";
import { assertTestTypeConfig, editorTheme, editorThemeDarkOverride } from "../constants";
import { generateId } from "../utils";
import {
  type AssertResult,
  type AssertTest,
  type AssertTestType,
  type TableInfo,
} from "../../runtime";
import { CellExecutionIndicator } from "./cell-execution-indicator";

export interface TestPanelProps {
  assertConfig: { tests: AssertTest[] };
  assertResults: AssertResult[];
  tables: TableInfo[];
  viewName?: string;
  isRunning: boolean;
  isRuntimeReady: boolean;
  isDark: boolean;
  onUpdateAssertConfig?: (config: { tests: AssertTest[] }) => void;
  onRunTests?: () => void;
}

export function TestPanel({
  assertConfig,
  assertResults,
  tables,
  viewName,
  isRunning,
  isRuntimeReady,
  isDark,
  onUpdateAssertConfig,
  onRunTests,
}: TestPanelProps) {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  const hasTests = assertConfig.tests.length > 0;

  const addTest = useCallback(
    (type: AssertTestType) => {
      if (!onUpdateAssertConfig) return;
      const newTest: AssertTest = {
        id: generateId(),
        type,
        tableName: viewName || "",
        columnName: "",
        acceptedValues: type === "accepted_values" ? [] : undefined,
        customSQL: type === "custom_sql" ? "" : undefined,
      };
      onUpdateAssertConfig({ tests: [...assertConfig.tests, newTest] });
    },
    [assertConfig.tests, onUpdateAssertConfig, viewName],
  );

  const updateTest = useCallback(
    (testId: string, updates: Partial<AssertTest>) => {
      if (!onUpdateAssertConfig) return;
      onUpdateAssertConfig({
        tests: assertConfig.tests.map((t) => (t.id === testId ? { ...t, ...updates } : t)),
      });
    },
    [assertConfig.tests, onUpdateAssertConfig],
  );

  const removeTest = useCallback(
    (testId: string) => {
      if (!onUpdateAssertConfig) return;
      onUpdateAssertConfig({
        tests: assertConfig.tests.filter((t) => t.id !== testId),
      });
    },
    [assertConfig.tests, onUpdateAssertConfig],
  );

  const toggleResultExpanded = useCallback((testId: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }, []);

  const getResultForTest = (testId: string): AssertResult | undefined =>
    assertResults.find((r) => r.testId === testId);

  return (
    <div className="p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {assertConfig.tests.length === 0 ? (
        <div className="font-mono text-sm text-neutral-400 dark:text-neutral-500 py-4 text-center">
          No tests configured. Add a test to validate your data.
        </div>
      ) : (
        assertConfig.tests.map((test) => {
          const ownTable = tables.find((t) => t.name === viewName);
          const columns = ownTable?.columns || [];
          const result = getResultForTest(test.id);
          const isExpanded = expandedResults.has(test.id);
          const isTestEnabled = test.enabled !== false;

          return (
            <div
              key={test.id}
              className={cn(
                "border border-neutral-200/50 dark:border-border/50 rounded-md bg-neutral-50/30 dark:bg-muted/30",
                !isTestEnabled && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2 p-2">
                <button
                  onClick={() => updateTest(test.id, { enabled: !isTestEnabled })}
                  className={cn(
                    "p-0.5 rounded transition-colors shrink-0",
                    isTestEnabled
                      ? "text-emerald-500 hover:text-emerald-600"
                      : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300",
                  )}
                  title={isTestEnabled ? "Disable test" : "Enable test"}
                >
                  <Power size={12} />
                </button>

                {isTestEnabled && result && (
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded",
                      result.passed
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-red-500/10 text-red-500",
                    )}
                  >
                    {result.passed ? "PASS" : "FAILED"}
                  </span>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0">
                      <span className="truncate">{assertTestTypeConfig[test.type].label}</span>
                      <ChevronDown size={10} className="opacity-50 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(Object.keys(assertTestTypeConfig) as AssertTestType[]).map((type) => (
                      <DropdownMenuItem key={type} onClick={() =>
                        updateTest(test.id, {
                          type,
                          acceptedValues: type === "accepted_values" ? [] : undefined,
                          customSQL: type === "custom_sql" ? "" : undefined,
                        })
                      } className="text-xs">
                        <span>{assertTestTypeConfig[type].label}</span>
                        {test.type === type && <Check size={12} className="ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {test.type !== "custom_sql" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn(
                        "flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0",
                        !test.columnName && "text-muted-foreground",
                      )}>
                        <span className="truncate">{test.columnName || "Column..."}</span>
                        <ChevronDown size={10} className="opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {columns.map((col) => (
                        <DropdownMenuItem key={col.name} onClick={() => updateTest(test.id, { columnName: col.name })} className="text-xs">
                          <span>{col.name}</span>
                          {test.columnName === col.name && <Check size={12} className="ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <div className="flex-1" />

                <button
                  onClick={() => removeTest(test.id)}
                  className="p-1 text-neutral-400 hover:text-red-500 rounded transition-colors"
                >
                  <X size={12} />
                </button>
              </div>

              {test.type === "accepted_values" && (
                <div className="px-2 pb-2">
                  <input
                    type="text"
                    value={(test.acceptedValues || []).join(", ")}
                    onChange={(e) =>
                      updateTest(test.id, {
                        acceptedValues: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Allowed values (comma-separated)"
                    className="w-full px-2 py-1 font-mono text-xs bg-white dark:bg-muted border border-neutral-200 dark:border-border rounded focus:outline-none transition-colors"
                  />
                </div>
              )}

              {test.type === "custom_sql" && (
                <div className="px-2 pb-2">
                  <CodeMirror
                    value={test.customSQL || ""}
                    onChange={(value) => updateTest(test.id, { customSQL: value })}
                    extensions={[
                      sqlLang(),
                      isDark ? editorThemeDarkOverride : editorTheme,
                      isDark ? oneDark : [],
                      EditorView.lineWrapping,
                    ]}
                    theme="light"
                    placeholder="-- SQL that should return 0 rows to pass"
                    basicSetup={{
                      lineNumbers: false,
                      foldGutter: false,
                      highlightActiveLine: false,
                      indentOnInput: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      autocompletion: true,
                    }}
                    className="min-h-[60px] border border-neutral-200 dark:border-border rounded [&_.cm-editor]:outline-none [&_.cm-editor]:bg-transparent"
                  />
                </div>
              )}

              {result && !result.passed && result.rows && result.rows.length > 0 && (
                <div className="border-t border-neutral-200/50 dark:border-border/50">
                  <button
                    onClick={() => toggleResultExpanded(test.id)}
                    className="w-full flex items-center gap-1 px-2 py-1 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-50/50 dark:hover:bg-muted/50"
                  >
                    <ChevronRight
                      size={12}
                      className={cn("transition-transform", isExpanded && "rotate-90")}
                    />
                    <span>
                      {result.rowCount} failing row{result.rowCount !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-border bg-neutral-50/50 dark:bg-muted/50">
                            {result.columns?.map((col, i) => (
                              <th
                                key={i}
                                className="px-2 py-1 text-left font-semibold text-neutral-950 dark:text-foreground whitespace-nowrap"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className="border-b border-neutral-200/50 dark:border-border/50 hover:bg-neutral-50/30 dark:hover:bg-muted/30"
                            >
                              {row.map((cellValue, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className="px-2 py-1 text-neutral-950 dark:text-foreground max-w-[200px] truncate"
                                >
                                  {cellValue === null ? (
                                    <span className="text-neutral-400 italic">null</span>
                                  ) : (
                                    String(cellValue)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {result && result.error && (
                <div className="px-2 pb-2">
                  <pre className="text-xs font-mono text-red-500 whitespace-pre-wrap bg-red-50 dark:bg-red-500/10 rounded p-2">
                    {result.error}
                  </pre>
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 px-2 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-accent rounded transition-colors">
              <Plus size={12} />
              <span>Test</span>
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[180px]">
            {(Object.keys(assertTestTypeConfig) as AssertTestType[]).map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => addTest(type)}
                className="flex flex-col items-start gap-0"
              >
                <span className="text-xs font-medium">
                  {assertTestTypeConfig[type].label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {assertTestTypeConfig[type].description}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasTests && onRunTests && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRunTests();
            }}
            disabled={!isRuntimeReady || isRunning}
            className="flex items-center gap-1 h-7 px-3 text-xs font-medium rounded-md border border-neutral-200 dark:border-border text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-accent transition-colors disabled:opacity-50"
          >
            <span>Run Tests</span>
          </button>
        )}
      </div>

      {isRunning && (
        <CellExecutionIndicator isQueued={false} isRunning={true} runningLabel="Running tests..." />
      )}
    </div>
  );
}
