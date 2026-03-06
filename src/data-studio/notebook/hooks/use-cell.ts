import { useCallback } from "react";
import type { NotebookCell } from "../../runtime";
import { useStore } from "../store";
import type { NotebookState } from "../store/types";

export interface CellData {
  cell: NotebookCell;
  isSelected: boolean;
  isRunning: boolean;
  isQueued: boolean;
}

function cellDataEqual(a: CellData, b: CellData): boolean {
  return (
    a.cell === b.cell &&
    a.isSelected === b.isSelected &&
    a.isRunning === b.isRunning &&
    a.isQueued === b.isQueued
  );
}

export function useCellData(id: string): CellData {
  const selector = useCallback(
    (state: NotebookState): CellData => {
      const cell = state.cellLookup.get(id)!;
      return {
        cell,
        isSelected: state.selectedCellId === id,
        isRunning: state.runningCellIds.has(id),
        isQueued: state.queuedCellIds.has(id),
      };
    },
    [id],
  );

  return useStore(selector, cellDataEqual);
}
