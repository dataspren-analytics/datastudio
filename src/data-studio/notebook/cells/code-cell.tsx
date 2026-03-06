"use client";

import { MonacoCodeEditor, type MonacoEditorHandle } from "../../components/monaco-code-editor";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore, selectIsDarkMode } from "../store";
import {
  getCellType,
  getSourceString,
  type DataSprenCellType,
  type MultilineString,
  type TableInfo,
} from "../../runtime";
import { CellWrapper } from "./cell-wrapper";
import { CodeCellToolbar } from "./code-cell-toolbar";
import { CodeCellOutputArea } from "./code-cell-output-area";

export interface CodeCellProps {
  id: string;
  source: MultilineString;
  executionCount: number | null;
  viewName: string | undefined;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  isRunning: boolean;
  isQueued: boolean;
  isRuntimeReady: boolean;
  tables: TableInfo[];
  onSelect: () => void;
  onUpdate: (source: string) => void;
  onDelete: () => void;
  onRun: (queryOverride?: string) => void;
  onChangeType: (type: DataSprenCellType | "markdown") => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateViewName: (newName: string) => void;
}

export function CodeCell({
  id,
  source,
  executionCount,
  viewName,
  isSelected,
  isFirst,
  isLast,
  isRunning,
  isQueued,
  isRuntimeReady,
  tables,
  onSelect,
  onUpdate,
  onDelete,
  onRun,
  onChangeType,
  onMoveUp,
  onMoveDown,
  onUpdateViewName,
}: CodeCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorHandle>(null);
  const isDarkMode = useStore(selectIsDarkMode);

  const cellType = getCellType(source);
  const isSQL = cellType === "sql";
  const cellSource = useMemo(() => getSourceString(source), [source]);

  // Focus management
  useEffect(() => {
    if (isSelected) {
      if (editorRef.current) {
        editorRef.current.focus();
      } else {
        const timer = setInterval(() => {
          if (editorRef.current) {
            editorRef.current.focus();
            clearInterval(timer);
          }
        }, 50);
        return () => clearInterval(timer);
      }
    } else if (
      document.activeElement instanceof HTMLElement &&
      cellRef.current?.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }, [isSelected]);

  // Debounced source sync
  const lastSyncedRef = useRef(cellSource);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSourceChange = useCallback((value: string) => {
    lastSyncedRef.current = value;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => onUpdate(value), 300);
  }, [onUpdate]);

  useEffect(() => () => clearTimeout(syncTimerRef.current), []);

  // External source changes (e.g. type conversion)
  useEffect(() => {
    if (cellSource !== lastSyncedRef.current) {
      lastSyncedRef.current = cellSource;
      editorRef.current?.replaceContent(cellSource);
    }
  }, [cellSource]);

  const handleRunCell = useCallback(() => {
    if (!isRuntimeReady || !editorRef.current) return;
    clearTimeout(syncTimerRef.current);
    const content = editorRef.current.getContent();
    lastSyncedRef.current = content;
    onUpdate(content);

    const selection = editorRef.current.getSelection();
    if (selection && cellType === "sql") {
      onRun(selection);
    } else {
      onRun();
    }
  }, [isRuntimeReady, onRun, onUpdate, cellType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      handleRunCell();
    }
  }, [handleRunCell]);

  const hasError = false; // Toolbar doesn't need live error state — output area handles it
  const viewExists = viewName
    ? tables.some((t) => t.name === viewName)
    : false;

  return (
    <div ref={cellRef} className="relative" data-cell-id={id}>
      <span className="absolute -left-14 top-1.5 w-12 text-right text-xs text-neutral-400 dark:text-neutral-500 select-none">
        [{executionCount ?? " "}]
      </span>

      <CellWrapper isSelected={isSelected} isRunning={isRunning} isQueued={isQueued} onSelect={onSelect}>
        <CodeCellToolbar
          cellType={cellType}
          viewName={viewName}
          isFirst={isFirst}
          isLast={isLast}
          isRunning={isRunning}
          isRuntimeReady={isRuntimeReady}
          hasError={hasError}
          viewExists={viewExists}
          onRun={handleRunCell}
          onChangeType={onChangeType}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
          onUpdateViewName={onUpdateViewName}
        />

        <div
          className="p-3"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onKeyDown={handleKeyDown}
        >
          <MonacoCodeEditor
            ref={editorRef}
            defaultValue={cellSource}
            onChange={handleSourceChange}
            language={isSQL ? "sql" : "python"}
            isDark={isDarkMode}
            minHeight={isSQL ? 42 : 80}
            autoFocus={isSelected}
            onMount={(editor) => {
              const styleId = "monaco-sql-magic-style";
              if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = `.sql-magic-decoration { color: #8b949e !important; }`;
                document.head.appendChild(style);
              }
              const decorations = editor.createDecorationsCollection([]);
              const update = () => {
                const model = editor.getModel();
                if (!model) return;
                const matches = model.findMatches("%%?sql\\b", false, true, false, null, false);
                decorations.set(
                  matches.map((m) => ({
                    range: m.range,
                    options: { inlineClassName: "sql-magic-decoration" },
                  })),
                );
              };
              update();
              editor.onDidChangeModelContent(update);
            }}
          />
        </div>

        <CodeCellOutputArea id={id} cellType={cellType} />
      </CellWrapper>
    </div>
  );
}
