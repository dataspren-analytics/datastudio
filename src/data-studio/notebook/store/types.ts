import type {
  AssertTest,
  DataSprenCellType,
  NotebookCell,
  VisualizeConfig,
} from "../../runtime";
import type { RuntimeContextValue } from "../../provider/runtime-provider";

// ============================================================================
// Store Data
// ============================================================================

export interface NotebookStore {
  cells: NotebookCell[];
  cellLookup: Map<string, NotebookCell>;
  cellIds: string[];
  selectedCellId: string | null;
  runningCellIds: Set<string>;
  queuedCellIds: Set<string>;

  /** External config synced from parent (via StoreUpdater pattern) */
  isDarkMode: boolean;
}

// ============================================================================
// Store Actions
// ============================================================================

export interface NotebookActions {
  selectCell: (id: string | null) => void;
  addCell: (type?: DataSprenCellType | "markdown", afterId?: string) => void;
  updateCell: (id: string, source: string) => void;
  deleteCell: (id: string) => void;
  runCell: (id: string, queryOverride?: string) => Promise<void>;
  runCellAndAdvance: (id: string, queryOverride?: string) => void;
  changeCellType: (id: string, type: DataSprenCellType | "markdown") => void;
  moveCellUp: (id: string) => void;
  moveCellDown: (id: string) => void;
  updateViewName: (id: string, newName: string) => void;
  updateAssertConfig: (id: string, config: { tests: AssertTest[] }) => void;
  runCellTests: (id: string) => Promise<void>;
  updateCellMetadata: (id: string, metadata: Record<string, unknown>) => void;
  refreshVizData: (id: string, configOverride?: VisualizeConfig) => Promise<void>;

  /** Internal: clear execution counts when runtime restarts */
  _onRuntimeReady: () => void;
}

// ============================================================================
// Combined State
// ============================================================================

export type NotebookState = NotebookStore & NotebookActions;

// ============================================================================
// External Dependencies (injected via closure)
// ============================================================================

export interface StoreExternalDeps {
  getRuntime: () => RuntimeContextValue;
  getActiveFilePath: () => string | null;
  updateNotebookCells: (filePath: string, cells: NotebookCell[]) => void;
}
