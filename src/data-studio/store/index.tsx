"use client";

import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createAppStore, type AppStoreInstance } from "./app-store";
import type { AppState } from "./types";

// ============================================================================
// Context
// ============================================================================

const AppStoreContext = createContext<AppStoreInstance | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStoreInstance>(undefined);
  if (!storeRef.current) {
    storeRef.current = createAppStore();
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

function useStoreInstance(): AppStoreInstance {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppStore must be used within an AppStoreProvider");
  }
  return store;
}

/**
 * Reactive hook — re-renders when selected slice changes.
 * Uses Object.is by default; pass `shallow` for compound selectors.
 */
export function useAppStore<T>(
  selector: (state: AppState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useStoreInstance();
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

/**
 * Imperative hook — returns the store instance for non-reactive reads.
 * Use for actions and event handlers.
 */
export function useAppStoreApi(): AppStoreInstance {
  return useStoreInstance();
}

export type { AppState } from "./types";
export {
  selectActiveFilePath,
  selectShowHome,
  selectIsDarkMode,
  selectSidebarCollapsed,
  selectSidebarWidth,
  selectExpandedPaths,
  selectSelectFile,
  selectSetShowHome,
  selectSetDarkMode,
  selectSetSidebarCollapsed,
  selectSetSidebarWidth,
  selectTogglePath,
  selectExpandPath,
} from "./selectors";
