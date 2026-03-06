import type { NotebookState } from "./types";

// ============================================================================
// Data Selectors
// ============================================================================
export const selectCells = (s: NotebookState) => s.cells;
export const selectCellLookup = (s: NotebookState) => s.cellLookup;
export const selectCellIds = (s: NotebookState) => s.cellIds;
export const selectSelectedCellId = (s: NotebookState) => s.selectedCellId;
export const selectRunningCellIds = (s: NotebookState) => s.runningCellIds;
export const selectQueuedCellIds = (s: NotebookState) => s.queuedCellIds;
export const selectIsDarkMode = (s: NotebookState) => s.isDarkMode;

// ============================================================================
// Action Selectors
// ============================================================================
export const selectSelectCell = (s: NotebookState) => s.selectCell;
export const selectAddCell = (s: NotebookState) => s.addCell;
export const selectUpdateCell = (s: NotebookState) => s.updateCell;
export const selectDeleteCell = (s: NotebookState) => s.deleteCell;
export const selectRunCell = (s: NotebookState) => s.runCell;
export const selectRunCellAndAdvance = (s: NotebookState) => s.runCellAndAdvance;
export const selectChangeCellType = (s: NotebookState) => s.changeCellType;
export const selectMoveCellUp = (s: NotebookState) => s.moveCellUp;
export const selectMoveCellDown = (s: NotebookState) => s.moveCellDown;
export const selectUpdateViewName = (s: NotebookState) => s.updateViewName;
export const selectUpdateAssertConfig = (s: NotebookState) => s.updateAssertConfig;
export const selectRunCellTests = (s: NotebookState) => s.runCellTests;
export const selectUpdateCellMetadata = (s: NotebookState) => s.updateCellMetadata;
export const selectRefreshVizData = (s: NotebookState) => s.refreshVizData;
