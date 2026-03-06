import type { NotebookCell } from "../../runtime";
import { buildCellLookup, extractCellIds } from "../logic/cell-operations";
import type { NotebookStore } from "./types";

export function getInitialState(cells: NotebookCell[]): NotebookStore {
  return {
    cells,
    cellLookup: buildCellLookup(cells),
    cellIds: extractCellIds(cells),
    selectedCellId: cells[0]?.id ?? null,
    runningCellIds: new Set(),
    queuedCellIds: new Set(),
    isDarkMode: true,
  };
}
