import { useCallback } from "react";
import type {
  AssertTest,
  CellOutput,
  TableData,
  VisualizeConfig,
} from "../../runtime";
import { useStore } from "../store";
import type { NotebookState } from "../store/types";

export interface CellOutputData {
  outputs: CellOutput[];
  viewName: string | undefined;
  activeTab: string | undefined;
  assertConfig: { tests: AssertTest[] } | undefined;
  visualizeConfig: VisualizeConfig | undefined;
  visualizeData: TableData | null;
  visibleRows: number | undefined;
  isRunning: boolean;
  isQueued: boolean;
}

function cellOutputEqual(a: CellOutputData, b: CellOutputData): boolean {
  return (
    a.outputs === b.outputs &&
    a.viewName === b.viewName &&
    a.activeTab === b.activeTab &&
    a.assertConfig === b.assertConfig &&
    a.visualizeConfig === b.visualizeConfig &&
    a.visualizeData === b.visualizeData &&
    a.visibleRows === b.visibleRows &&
    a.isRunning === b.isRunning &&
    a.isQueued === b.isQueued
  );
}

export function useCellOutputData(id: string): CellOutputData {
  const selector = useCallback(
    (state: NotebookState): CellOutputData => {
      const cell = state.cellLookup.get(id)!;
      const outputs = cell.cell_type === "code" ? cell.outputs : [];
      return {
        outputs,
        viewName: cell.metadata.viewName,
        activeTab: cell.metadata.activeTab as string | undefined,
        assertConfig: cell.metadata.assertConfig,
        visualizeConfig: cell.metadata.visualizeConfig,
        visualizeData: (cell.metadata.visualizeData as TableData | null) ?? null,
        visibleRows: cell.metadata.visibleRows as number | undefined,
        isRunning: state.runningCellIds.has(id),
        isQueued: state.queuedCellIds.has(id),
      };
    },
    [id],
  );

  return useStore(selector, cellOutputEqual);
}
