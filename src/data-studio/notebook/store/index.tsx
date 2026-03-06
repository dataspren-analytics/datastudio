"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore as useZustandStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useNotebook } from "../../provider/notebook-provider";
import { useRuntime } from "../../provider/runtime-provider";
import { useAppStoreApi } from "../../store";
import {
  createNotebookStore,
  type NotebookStoreInstance,
} from "./notebook-store";
import type { NotebookState, StoreExternalDeps } from "./types";

// ============================================================================
// Context
// ============================================================================

const StoreContext = createContext<NotebookStoreInstance | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface NotebookStoreProviderProps {
  isDarkMode?: boolean;
  children: ReactNode;
}

export function NotebookStoreProvider({ isDarkMode = true, children }: NotebookStoreProviderProps) {
  const { activeNotebook, updateNotebookCells } = useNotebook();
  const runtime = useRuntime();
  const appStoreApi = useAppStoreApi();

  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const updateNotebookCellsRef = useRef(updateNotebookCells);
  updateNotebookCellsRef.current = updateNotebookCells;

  const [store] = useState(() => {
    const initialCells = activeNotebook?.document.cells ?? [];
    const deps: StoreExternalDeps = {
      getRuntime: () => runtimeRef.current,
      getActiveFilePath: () => appStoreApi.getState().activeFilePath,
      updateNotebookCells: (fp, cells) =>
        updateNotebookCellsRef.current(fp, cells),
    };
    return createNotebookStore(initialCells, deps);
  });

  // Reset execution counts when runtime becomes ready
  const prevIsReadyRef = useRef(runtime.isReady);
  useEffect(() => {
    if (runtime.isReady && !prevIsReadyRef.current) {
      store.getState()._onRuntimeReady();
    }
    prevIsReadyRef.current = runtime.isReady;
  }, [store, runtime.isReady]);

  // Sync external config into store (StoreUpdater pattern)
  useEffect(() => {
    store.setState({ isDarkMode });
  }, [store, isDarkMode]);

  // Cleanup persist timer on unmount
  useEffect(() => {
    return () => {
      (store as unknown as { _cleanup?: () => void })._cleanup?.();
    };
  }, [store]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

function useStoreInstance(): NotebookStoreInstance {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error(
      "useStore must be used within a NotebookStoreProvider",
    );
  }
  return store;
}

/**
 * Reactive hook — re-renders when selected slice changes.
 * Use with a selector and optional equality function.
 */
export function useStore<T>(
  selector: (state: NotebookState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useStoreInstance();
  if (equalityFn) {
    return useStoreWithEqualityFn(store, selector, equalityFn);
  }
  return useZustandStore(store, selector);
}

/**
 * Imperative hook — returns the store instance for non-reactive reads.
 * Use for actions and event handlers.
 */
export function useStoreApi(): NotebookStoreInstance {
  return useStoreInstance();
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  selectCells,
  selectCellLookup,
  selectCellIds,
  selectSelectedCellId,
  selectRunningCellIds,
  selectQueuedCellIds,
  selectIsDarkMode,
  selectSelectCell,
  selectAddCell,
  selectUpdateCell,
  selectDeleteCell,
  selectRunCell,
  selectRunCellAndAdvance,
  selectChangeCellType,
  selectMoveCellUp,
  selectMoveCellDown,
  selectUpdateViewName,
  selectUpdateAssertConfig,
  selectRunCellTests,
  selectUpdateCellMetadata,
  selectRefreshVizData,
} from "./selectors";
