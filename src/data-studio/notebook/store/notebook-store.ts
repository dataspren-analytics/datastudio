import { createStore } from "zustand";
import {
  createAssertOutput,
  isCodeCell,
  type CellOutput,
  type NotebookCell,
} from "../../runtime";
import {
  buildCellLookup,
  convertCellType,
  createCodeCell,
  createMarkdownCell,
  extractCellIds,
  getMaxExecutionCount,
  insertCellAfter,
  removeCell,
  swapCells,
} from "../logic/cell-operations";
import {
  executeAssertTests,
  executeCell,
  fetchVizData,
} from "../logic/cell-execution";
import { getInitialState } from "./initial-state";
import type { NotebookState, StoreExternalDeps } from "./types";

// ============================================================================
// Helpers
// ============================================================================

/** Rebuild cellLookup + cellIds whenever cells change */
function withDerivedState(cells: NotebookCell[]) {
  return {
    cells,
    cellLookup: buildCellLookup(cells),
    cellIds: extractCellIds(cells),
  };
}

// ============================================================================
// Store Factory
// ============================================================================

export function createNotebookStore(
  initialCells: NotebookCell[],
  deps: StoreExternalDeps,
) {
  let nextViewNumber = 3;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  function schedulePersist(getCells: () => NotebookCell[]) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const filePath = deps.getActiveFilePath();
      if (filePath) {
        const cells = getCells();
        deps.updateNotebookCells(filePath, cells);
      }
    }, 300);
  }

  function persistNow(getCells: () => NotebookCell[]) {
    clearTimeout(persistTimer);
    const filePath = deps.getActiveFilePath();
    if (filePath) {
      queueMicrotask(() => {
        const cells = getCells();
        deps.updateNotebookCells(filePath, cells);
      });
    }
  }

  const store = createStore<NotebookState>()((set, get) => ({
    // --- Initial data ---
    ...getInitialState(initialCells),

    // --- Actions ---

    selectCell: (id) => {
      set({ selectedCellId: id });
    },

    addCell: (type = "python", afterId?) => {
      const newCell =
        type === "markdown"
          ? createMarkdownCell()
          : createCodeCell(type, nextViewNumber++);

      set((state) => ({
        ...withDerivedState(insertCellAfter(state.cells, newCell, afterId)),
        selectedCellId: newCell.id,
      }));
      schedulePersist(() => get().cells);
    },

    updateCell: (id, source) => {
      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) => (c.id === id ? { ...c, source } : c)),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    deleteCell: (id) => {
      set((state) => ({
        ...withDerivedState(removeCell(state.cells, id)),
      }));
      schedulePersist(() => get().cells);
    },

    changeCellType: (id, type) => {
      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) => {
            if (c.id !== id) return c;
            return convertCellType(c, type, nextViewNumber++);
          }),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    updateCellMetadata: (id, metadata) => {
      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) =>
            c.id === id
              ? { ...c, metadata: { ...c.metadata, ...metadata } }
              : c,
          ),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    updateViewName: (id, newName) => {
      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) =>
            c.id === id
              ? { ...c, metadata: { ...c.metadata, viewName: newName } }
              : c,
          ),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    updateAssertConfig: (id, assertConfig) => {
      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) =>
            c.id === id
              ? { ...c, metadata: { ...c.metadata, assertConfig } }
              : c,
          ),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    moveCellUp: (id) => {
      set((state) => ({
        ...withDerivedState(swapCells(state.cells, id, "up")),
      }));
      schedulePersist(() => get().cells);
    },

    moveCellDown: (id) => {
      set((state) => ({
        ...withDerivedState(swapCells(state.cells, id, "down")),
      }));
      schedulePersist(() => get().cells);
    },

    refreshVizData: async (id, configOverride?) => {
      const cell = get().cellLookup.get(id);
      if (!cell) return;

      const runtime = deps.getRuntime();
      const data = await fetchVizData(cell, runtime, configOverride);

      set((state) => ({
        ...withDerivedState(
          state.cells.map((c) =>
            c.id === id
              ? { ...c, metadata: { ...c.metadata, visualizeData: data } }
              : c,
          ),
        ),
      }));
      schedulePersist(() => get().cells);
    },

    runCell: async (id, queryOverride?) => {
      const cell = get().cellLookup.get(id);
      if (!cell) return;

      const execCount = getMaxExecutionCount(get().cells) + 1;

      set((state) => {
        const newRunning = new Set(state.runningCellIds);
        newRunning.add(id);
        const newQueued = new Set(state.queuedCellIds);
        newQueued.delete(id);
        return {
          ...withDerivedState(
            state.cells.map((c) =>
              c.id === id
                ? { ...c, outputs: [], execution_count: execCount }
                : c,
            ),
          ),
          runningCellIds: newRunning,
          queuedCellIds: newQueued,
        };
      });
      persistNow(() => get().cells);

      const runtime = deps.getRuntime();
      const { outputs, shouldRefreshViz } = await executeCell(
        cell,
        runtime,
        execCount,
        queryOverride,
      );

      set((state) => {
        const newRunning = new Set(state.runningCellIds);
        newRunning.delete(id);
        return {
          ...withDerivedState(
            state.cells.map((c) => (c.id === id ? { ...c, outputs } : c)),
          ),
          runningCellIds: newRunning,
        };
      });
      persistNow(() => get().cells);

      if (shouldRefreshViz) {
        get().refreshVizData(id).catch(() => {});
      }
    },

    runCellAndAdvance: (id, queryOverride?) => {
      set((state) => {
        const newQueued = new Set(state.queuedCellIds);
        newQueued.add(id);
        const currentIndex = state.cells.findIndex((c) => c.id === id);
        const nextId =
          currentIndex !== -1 && currentIndex < state.cells.length - 1
            ? state.cells[currentIndex + 1].id
            : state.selectedCellId;
        return {
          queuedCellIds: newQueued,
          selectedCellId: nextId,
        };
      });
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      get().runCell(id, queryOverride);
    },

    runCellTests: async (id) => {
      const cell = get().cellLookup.get(id);
      if (!cell || !isCodeCell(cell)) return;

      const tests = cell.metadata.assertConfig?.tests;
      if (!tests || tests.length === 0) return;

      set((state) => {
        const newRunning = new Set(state.runningCellIds);
        newRunning.add(id);
        return { runningCellIds: newRunning };
      });

      const runtime = deps.getRuntime();
      const assertResults = await executeAssertTests(runtime, tests);
      const assertOutput = createAssertOutput(assertResults);

      set((state) => {
        const newRunning = new Set(state.runningCellIds);
        newRunning.delete(id);
        return {
          ...withDerivedState(
            state.cells.map((c) => {
              if (c.id !== id || !isCodeCell(c)) return c;
              const updatedOutputs = [
                ...c.outputs.filter(
                  (o: CellOutput) =>
                    !(
                      o.output_type === "display_data" &&
                      "data" in o &&
                      (o.data as Record<string, unknown>)?.[
                        "application/vnd.dataspren.assert+json"
                      ]
                    ),
                ),
                assertOutput,
              ];
              return { ...c, outputs: updatedOutputs };
            }),
          ),
          runningCellIds: newRunning,
        };
      });
      persistNow(() => get().cells);
    },

    // --- Internal actions ---

    _onRuntimeReady: () => {
      set((state) => {
        const needsReset = state.cells.some(
          (c) => isCodeCell(c) && c.execution_count != null,
        );
        if (!needsReset) return state;
        return withDerivedState(
          state.cells.map((c) =>
            isCodeCell(c) && c.execution_count != null
              ? { ...c, execution_count: null }
              : c,
          ),
        );
      });
      persistNow(() => get().cells);
    },
  }));

  // Cleanup timer on unmount (called from provider)
  (store as unknown as { _cleanup: () => void })._cleanup = () => {
    clearTimeout(persistTimer);
  };

  return store;
}

export type NotebookStoreInstance = ReturnType<typeof createNotebookStore>;
