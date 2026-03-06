import { useMemo } from "react";
import { useStoreApi } from "../store";
import type { NotebookActions } from "../store/types";

export function useCellActions(): NotebookActions {
  const store = useStoreApi();

  return useMemo(() => {
    const s = store.getState();
    return {
      selectCell: s.selectCell,
      addCell: s.addCell,
      updateCell: s.updateCell,
      deleteCell: s.deleteCell,
      runCell: s.runCell,
      runCellAndAdvance: s.runCellAndAdvance,
      changeCellType: s.changeCellType,
      moveCellUp: s.moveCellUp,
      moveCellDown: s.moveCellDown,
      updateViewName: s.updateViewName,
      updateAssertConfig: s.updateAssertConfig,
      runCellTests: s.runCellTests,
      updateCellMetadata: s.updateCellMetadata,
      refreshVizData: s.refreshVizData,
      _onRuntimeReady: s._onRuntimeReady,
    };
  }, [store]);
}
