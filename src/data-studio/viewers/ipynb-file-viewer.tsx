"use client";

import { NotebookStoreProvider, NotebookCellsViewer, Sidebar } from "../notebook";
import { useDataStudioConfig } from "../provider/data-studio-provider";
import { NotebookProviderInternal } from "../provider/notebook-provider";
import { useAppStore, selectIsDarkMode } from "../store";
import type { FileViewerProps } from "./types";

export function IpynbFileViewer({ filePath }: FileViewerProps) {
  const isDarkMode = useAppStore(selectIsDarkMode);
  const { initialCells, ephemeral } = useDataStudioConfig();

  return (
    <NotebookProviderInternal initialCells={initialCells} ephemeral={ephemeral}>
      <NotebookStoreProvider key={filePath} isDarkMode={isDarkMode}>
        <div className="flex flex-1 overflow-hidden">
          <NotebookCellsViewer />
          <div className="w-60 border-l border-stone-200 dark:border-border bg-white dark:bg-sidebar flex flex-col">
            <div className="flex-1 overflow-auto">
              <Sidebar />
            </div>
          </div>
        </div>
      </NotebookStoreProvider>
    </NotebookProviderInternal>
  );
}
