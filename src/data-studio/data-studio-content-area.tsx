"use client";

import { FileX, Loader2 } from "lucide-react";
import { getFileName } from "./lib/paths";
import { IpynbFileViewer } from "./viewers/ipynb-file-viewer";
import { useRuntime } from "./provider/runtime-provider";
import { useAppStore, selectActiveFilePath } from "./store";
import { getFileType } from "./lib/file-types";

export function ContentArea() {
  const runtime = useRuntime();
  const activeFilePath = useAppStore(selectActiveFilePath);

  if (!activeFilePath) {
    return <IpynbFileViewer filePath="" runtime={runtime} />;
  }

  const fileType = getFileType(activeFilePath);

  if (runtime.isReady && runtime.dataFiles.length > 0) {
    const fileExists = runtime.dataFiles.some((f) => f.path === activeFilePath);
    if (!fileExists) {
      const fileName = getFileName(activeFilePath, activeFilePath);
      return (
        <div className="flex-1 flex items-center justify-center bg-stone-50 dark:bg-background">
          <div className="flex flex-col items-center gap-3 max-w-sm text-center px-4">
            <FileX size={32} className="text-neutral-400 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">File not available</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              <span className="font-mono">{fileName}</span> may have been deleted or moved.
            </p>
          </div>
        </div>
      );
    }
  }

  if (!runtime.isReady && !fileType.canRenderWithoutRuntime) {
    return (
      <div className="flex-1 flex items-center justify-center bg-stone-50 dark:bg-background">
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading runtime...</span>
        </div>
      </div>
    );
  }

  const Viewer = fileType.viewer;
  return <Viewer filePath={activeFilePath} runtime={runtime} />;
}
