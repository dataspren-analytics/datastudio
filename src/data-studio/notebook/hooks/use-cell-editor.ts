import { useCallback } from "react";
import type { MultilineString } from "../../runtime";
import { useStore } from "../store";
import type { NotebookState } from "../store/types";

export interface CellEditorData {
  source: MultilineString;
  executionCount: number | null;
  viewName: string | undefined;
  isSelected: boolean;
  isRunning: boolean;
  isQueued: boolean;
}

function cellEditorEqual(a: CellEditorData, b: CellEditorData): boolean {
  return (
    a.source === b.source &&
    a.executionCount === b.executionCount &&
    a.viewName === b.viewName &&
    a.isSelected === b.isSelected &&
    a.isRunning === b.isRunning &&
    a.isQueued === b.isQueued
  );
}

export function useCellEditor(id: string): CellEditorData {
  const selector = useCallback(
    (state: NotebookState): CellEditorData => {
      const cell = state.cellLookup.get(id)!;
      return {
        source: cell.source,
        executionCount:
          cell.cell_type === "code" ? cell.execution_count : null,
        viewName: cell.metadata.viewName,
        isSelected: state.selectedCellId === id,
        isRunning: state.runningCellIds.has(id),
        isQueued: state.queuedCellIds.has(id),
      };
    },
    [id],
  );

  return useStore(selector, cellEditorEqual);
}
