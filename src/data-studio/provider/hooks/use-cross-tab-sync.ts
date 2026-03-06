import { useEffect, useRef } from "react";
import type { FileInfo } from "../../runtime";
import type { NotebookEntry } from "../notebook-provider";

/**
 * Remove notebooks whose .ipynb files no longer exist in the runtime file list.
 * Handles cross-tab deletion via BroadcastChannel-triggered dataFiles refresh.
 */
export function useCrossTabNotebookSync(
  dataFiles: FileInfo[],
  isLoaded: boolean,
  setNotebooks: React.Dispatch<React.SetStateAction<NotebookEntry[]>>,
) {
  const prevDataFilesRef = useRef(dataFiles);

  useEffect(() => {
    if (!isLoaded || dataFiles.length === 0) return;
    // Only react when dataFiles actually shrinks (files were removed)
    if (dataFiles.length >= prevDataFilesRef.current.length) {
      prevDataFilesRef.current = dataFiles;
      return;
    }
    prevDataFilesRef.current = dataFiles;

    const existingPaths = new Set(dataFiles.map((f) => f.path));
    setNotebooks((prev) => {
      const filtered = prev.filter((n) => existingPaths.has(n.filePath));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [dataFiles, isLoaded, setNotebooks]);
}
