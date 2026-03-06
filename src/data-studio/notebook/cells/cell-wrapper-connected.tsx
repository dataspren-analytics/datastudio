"use client";

import { memo, useCallback } from "react";
import { useStore } from "../store";
import type { NotebookState } from "../store/types";
import { CodeCell } from "./code-cell";
import { MarkdownCell } from "./markdown-cell";
import { useRuntime } from "../../provider/runtime-provider";
import { useCellEditor } from "../hooks/use-cell-editor";
import { useCellData } from "../hooks/use-cell";
import { useCellActions } from "../hooks/use-cell-actions";

interface CellWrapperConnectedProps {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}

// Module-level selector: only subscribes to cell_type for routing
function useCellType(id: string): "code" | "markdown" | "raw" {
  const selector = useCallback(
    (state: NotebookState) => state.cellLookup.get(id)!.cell_type,
    [id],
  );
  return useStore(selector);
}

/** Code cell path — uses narrow useCellEditor hook (no output subscription) */
const CodeCellConnected = memo(function CodeCellConnected({
  id,
  isFirst,
  isLast,
}: CellWrapperConnectedProps) {
  const editor = useCellEditor(id);
  const actions = useCellActions();
  const runtime = useRuntime();

  const onSelect = useCallback(() => actions.selectCell(id), [actions, id]);
  const onUpdate = useCallback(
    (source: string) => actions.updateCell(id, source),
    [actions, id],
  );
  const onDelete = useCallback(() => actions.deleteCell(id), [actions, id]);
  const onMoveUp = useCallback(() => actions.moveCellUp(id), [actions, id]);
  const onMoveDown = useCallback(() => actions.moveCellDown(id), [actions, id]);
  const onRun = useCallback(
    (queryOverride?: string) => actions.runCellAndAdvance(id, queryOverride),
    [actions, id],
  );
  const onChangeType = useCallback(
    (type: Parameters<typeof actions.changeCellType>[1]) =>
      actions.changeCellType(id, type),
    [actions, id],
  );
  const onUpdateViewName = useCallback(
    (newName: string) => actions.updateViewName(id, newName),
    [actions, id],
  );

  return (
    <CodeCell
      id={id}
      source={editor.source}
      executionCount={editor.executionCount}
      viewName={editor.viewName}
      isSelected={editor.isSelected}
      isRunning={editor.isRunning}
      isQueued={editor.isQueued}
      isRuntimeReady={runtime.isReady}
      tables={runtime.tables ?? []}
      onSelect={onSelect}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onRun={onRun}
      onChangeType={onChangeType}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
      onUpdateViewName={onUpdateViewName}
    />
  );
});

/** Markdown cell path — uses full useCellData (no perf concern, no outputs) */
const MarkdownCellConnected = memo(function MarkdownCellConnected({
  id,
  isFirst,
  isLast,
}: CellWrapperConnectedProps) {
  const { cell, isSelected } = useCellData(id);
  const actions = useCellActions();

  const onSelect = useCallback(() => actions.selectCell(id), [actions, id]);
  const onUpdate = useCallback(
    (source: string) => actions.updateCell(id, source),
    [actions, id],
  );
  const onDelete = useCallback(() => actions.deleteCell(id), [actions, id]);
  const onMoveUp = useCallback(() => actions.moveCellUp(id), [actions, id]);
  const onMoveDown = useCallback(() => actions.moveCellDown(id), [actions, id]);

  if (cell.cell_type !== "markdown") return null;

  return (
    <MarkdownCell
      cell={cell}
      isSelected={isSelected}
      onSelect={onSelect}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    />
  );
});

export const CellWrapperConnected = memo(function CellWrapperConnected({
  id,
  isFirst,
  isLast,
}: CellWrapperConnectedProps) {
  const cellType = useCellType(id);

  if (cellType === "code") {
    return <CodeCellConnected id={id} isFirst={isFirst} isLast={isLast} />;
  }

  if (cellType === "markdown") {
    return <MarkdownCellConnected id={id} isFirst={isFirst} isLast={isLast} />;
  }

  return null;
});
