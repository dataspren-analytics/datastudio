import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState } from "./types";

import { DEFAULT_EXPANDED_PATHS } from "../lib/paths";
const DEFAULT_SIDEBAR_WIDTH = 224;

export function createAppStore() {
  return createStore<AppState>()(
    persist(
      (set) => ({
        // --- Initial data ---
        activeFilePath: null,
        showHome: true,
        isDarkMode: true,
        sidebarCollapsed: false,
        sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
        expandedPaths: DEFAULT_EXPANDED_PATHS,

        // --- Actions ---

        selectFile: (path) => {
          set({ activeFilePath: path, showHome: false });
        },

        setShowHome: (show) => {
          set({ showHome: show });
        },

        setDarkMode: (dark) => {
          set({ isDarkMode: dark });
        },

        setSidebarCollapsed: (collapsed) => {
          set({ sidebarCollapsed: collapsed });
        },

        setSidebarWidth: (width) => {
          set({ sidebarWidth: width });
        },

        togglePath: (path) => {
          set((state) => {
            const paths = new Set(state.expandedPaths);
            if (paths.has(path)) {
              paths.delete(path);
            } else {
              paths.add(path);
            }
            return { expandedPaths: [...paths] };
          });
        },

        expandPath: (path) => {
          set((state) => {
            if (state.expandedPaths.includes(path)) return state;
            return { expandedPaths: [...state.expandedPaths, path] };
          });
        },

        collapsePath: (path) => {
          set((state) => ({
            expandedPaths: state.expandedPaths.filter((p) => p !== path),
          }));
        },
      }),
      {
        name: "data-studio-app",
        partialize: (state) => ({
          activeFilePath: state.activeFilePath,
          showHome: state.showHome,
          isDarkMode: state.isDarkMode,
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarWidth: state.sidebarWidth,
          expandedPaths: state.expandedPaths,
        }),
      },
    ),
  );
}

export type AppStoreInstance = ReturnType<typeof createAppStore>;
