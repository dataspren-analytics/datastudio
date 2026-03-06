// ============================================================================
// Store Data (persisted to localStorage)
// ============================================================================

export interface AppStore {
  /** Currently active/selected file path */
  activeFilePath: string | null;

  /** Whether the home page is shown */
  showHome: boolean;

  /** Dark mode enabled */
  isDarkMode: boolean;

  /** File sidebar collapsed */
  sidebarCollapsed: boolean;

  /** File sidebar width in pixels */
  sidebarWidth: number;

  /** Expanded directory paths in the file tree */
  expandedPaths: string[];
}

// ============================================================================
// Store Actions
// ============================================================================

export interface AppActions {
  selectFile: (path: string | null) => void;
  setShowHome: (show: boolean) => void;
  setDarkMode: (dark: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  togglePath: (path: string) => void;
  expandPath: (path: string) => void;
  collapsePath: (path: string) => void;
}

// ============================================================================
// Combined State
// ============================================================================

export type AppState = AppStore & AppActions;
