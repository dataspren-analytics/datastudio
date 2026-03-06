"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { IExecutionBackend, NotebookCell } from "../runtime";
import { AppStoreProvider } from "../store";
import { RuntimeProvider } from "./runtime-provider";

/**
 * Configuration for the DataStudio provider stack.
 */
export interface NotebookProviderConfig {
  /** Execution backend instance */
  execution: IExecutionBackend;

  /** Auto-initialize runtime on mount (default: true) */
  autoInit?: boolean;

  /** Initial cells for new notebooks (optional) */
  initialCells?: NotebookCell[];

  /**
   * Ephemeral mode - single notebook, no persistence, no multi-notebook UI.
   * When true, initialCells are used directly.
   */
  ephemeral?: boolean;
}

// ============================================================================
// Config Context — threads initialCells/ephemeral to the scoped provider
// ============================================================================

interface DataStudioConfigValue {
  initialCells?: NotebookCell[];
  ephemeral?: boolean;
}

const ConfigProvider = createContext<DataStudioConfigValue>({});

export function useDataStudioConfig(): DataStudioConfigValue {
  return useContext(ConfigProvider);
}

// ============================================================================
// DataStudioProvider
// ============================================================================

interface DataStudioProviderProps {
  config: NotebookProviderConfig;
  children: ReactNode;
}

/**
 * Composes RuntimeProvider with a lightweight config context.
 * NotebookProviderInternal now lives in the notebook view scope (ContentArea).
 *
 * Usage:
 * ```tsx
 * <DataStudioProvider config={config}>
 *   <DataStudioView />
 * </DataStudioProvider>
 * ```
 */
export function DataStudioProvider({ config, children }: DataStudioProviderProps) {
  const configValue = useMemo(
    () => ({ initialCells: config.initialCells, ephemeral: config.ephemeral }),
    [config.initialCells, config.ephemeral],
  );

  return (
    <AppStoreProvider>
      <ConfigProvider value={configValue}>
        <RuntimeProvider execution={config.execution} autoInit={config.autoInit}>
          {children}
        </RuntimeProvider>
      </ConfigProvider>
    </AppStoreProvider>
  );
}
