import { useEffect, useRef } from "react";
import { listOPFSFiles } from "../../runtime/opfs-list";
import type { FileInfo } from "../../runtime";

/**
 * Load the OPFS file listing on the main thread before Pyodide initializes,
 * so the file tree is visible immediately.
 */
export function useEarlyOPFSLoad(
  setDataFiles: React.Dispatch<React.SetStateAction<FileInfo[]>>,
) {
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    listOPFSFiles().then((files) => {
      if (files.length > 0) {
        setDataFiles((prev) => (prev.length === 0 ? files : prev));
      }
    });
  }, [setDataFiles]);
}
