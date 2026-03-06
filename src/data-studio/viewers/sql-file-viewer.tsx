"use client";

import { AlertCircle, Loader2, Play } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { TableData } from "../runtime";
import { ResizablePanel } from "../components/resizable-panel";
import { ResultTable } from "../notebook";
import { MonacoCodeEditor, type MonacoEditorHandle } from "../components/monaco-code-editor";
import { useAppStore, selectIsDarkMode } from "../store";
import { useFileLoader } from "./hooks/use-file-loader";
import { useAutoSave } from "./hooks/use-auto-save";
import { getFileName } from "./hooks/file-path-utils";
import type { FileViewerProps } from "./types";

type QueryState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; tableData: TableData; totalRows?: number }
  | { status: "error"; message: string };

interface SqlRuntimeActions {
  readFile: (name: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
  runSQL: (sql: string, viewName?: string) => Promise<{
    output: string;
    error?: string;
    tableData?: TableData;
    totalRows?: number;
  }>;
}

interface SqlFileViewerInnerProps {
  filePath: string;
  runtimeActions: SqlRuntimeActions;
}

const SqlFileViewerInner = memo(function SqlFileViewerInner({
  filePath,
  runtimeActions,
}: SqlFileViewerInnerProps) {
  const isDark = useAppStore(selectIsDarkMode);
  const [content, setContent] = useState("");
  const [queryState, setQueryState] = useState<QueryState>({ status: "idle" });
  const contentRef = useRef("");
  const [resultsHeight, setResultsHeight] = useState(450);
  const editorRef = useRef<MonacoEditorHandle>(null);

  const loadFn = useCallback((data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    setContent(text);
    contentRef.current = text;
    setQueryState({ status: "idle" });
    return { content: text };
  }, []);

  const fileState = useFileLoader(filePath, loadFn, runtimeActions.readFile);
  const save = useAutoSave(filePath, runtimeActions.writeFile);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      contentRef.current = value;
      save(value);
    },
    [save],
  );

  const handleRun = useCallback(async () => {
    if (!editorRef.current) return;

    const selection = editorRef.current.getSelection();
    const fullContent = editorRef.current.getContent();
    const sqlContent = (selection || fullContent).trim();

    if (!sqlContent) return;

    if (!selection) {
      contentRef.current = fullContent;
    }

    setQueryState({ status: "running" });

    try {
      const result = await runtimeActions.runSQL(sqlContent);

      if (result.error) {
        setQueryState({ status: "error", message: result.error });
        return;
      }

      if (result.tableData && result.tableData.length > 0) {
        setQueryState({
          status: "success",
          tableData: result.tableData,
          totalRows: result.totalRows,
        });
      } else {
        setQueryState({
          status: "success",
          tableData: [],
        });
      }
    } catch (e) {
      console.error("Failed to execute SQL:", e);
      setQueryState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to execute query",
      });
    }
  }, [runtimeActions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      handleRun();
    }
  }, [handleRun]);

  if (fileState.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (fileState.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">{fileState.message}</div>
      </div>
    );
  }

  const fileName = getFileName(filePath, "query.sql");
  const baseName = fileName.replace(/\.sql$/, "");

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-border bg-white dark:bg-card">
        <button
          onClick={handleRun}
          disabled={queryState.status === "running"}
          className="p-1 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 dark:text-neutral-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-950 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={queryState.status === "running" ? "Running..." : "Run query (⇧+Enter or ⌘+Enter)"}
        >
          {queryState.status === "running" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
        </button>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {navigator.platform?.includes("Mac") ? "⇧ + Enter" : "Ctrl + Enter"}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden" onKeyDown={handleKeyDown}>
        <MonacoCodeEditor
          ref={editorRef}
          defaultValue={content}
          onChange={handleChange}
          language="sql"
          isDark={isDark}
          enableScrolling
          showLineNumbers
          resetKey={filePath}
        />
      </div>

      {/* Results panel */}
      {queryState.status !== "idle" && (
        <ResizablePanel
          direction="vertical"
          size={resultsHeight}
          onSizeChange={setResultsHeight}
          minSize={100}
          maxSize={800}
          handlePosition="start"
          contentClassName="bg-white dark:bg-card flex flex-col border-t border-neutral-200 dark:border-border"
        >
          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-border/50">
            Results
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {queryState.status === "running" && (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  className="animate-spin text-neutral-400"
                  size={20}
                />
              </div>
            )}

            {queryState.status === "error" && (
              <div className="flex items-start gap-2 p-3">
                <AlertCircle
                  size={14}
                  className="text-red-500 shrink-0 mt-0.5"
                />
                <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
                  {queryState.message}
                </pre>
              </div>
            )}

            {queryState.status === "success" && (
              <>
                {queryState.tableData.length > 0 ? (
                  <ResultTable
                    tableData={queryState.tableData}
                    totalRows={queryState.totalRows}
                    cellId={baseName}
                    fillHeight
                  />
                ) : (
                  <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
                    Query executed successfully (no rows returned)
                  </div>
                )}
              </>
            )}
          </div>
        </ResizablePanel>
      )}
    </div>
  );
});

export function SqlFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<SqlRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
      runSQL: runtime.runSQL,
    }),
    [runtime.readFile, runtime.writeFile, runtime.runSQL],
  );

  return (
    <SqlFileViewerInner filePath={filePath} runtimeActions={runtimeActions} />
  );
}
