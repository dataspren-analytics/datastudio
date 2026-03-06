import type { AppState } from "./types";

// ============================================================================
// Data Selectors (module-level — stable references, no recreation per render)
// ============================================================================

export const selectActiveFilePath = (s: AppState) => s.activeFilePath;
export const selectShowHome = (s: AppState) => s.showHome;
export const selectIsDarkMode = (s: AppState) => s.isDarkMode;
export const selectSidebarCollapsed = (s: AppState) => s.sidebarCollapsed;
export const selectSidebarWidth = (s: AppState) => s.sidebarWidth;
export const selectExpandedPaths = (s: AppState) => s.expandedPaths;

// ============================================================================
// Action Selectors (stable — zustand action refs never change)
// ============================================================================

export const selectSelectFile = (s: AppState) => s.selectFile;
export const selectSetShowHome = (s: AppState) => s.setShowHome;
export const selectSetDarkMode = (s: AppState) => s.setDarkMode;
export const selectSetSidebarCollapsed = (s: AppState) => s.setSidebarCollapsed;
export const selectSetSidebarWidth = (s: AppState) => s.setSidebarWidth;
export const selectTogglePath = (s: AppState) => s.togglePath;
export const selectExpandPath = (s: AppState) => s.expandPath;
