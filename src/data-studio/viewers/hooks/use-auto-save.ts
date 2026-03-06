import { useCallback, useEffect, useRef } from "react";
import { AUTO_SAVE_DEBOUNCE_MS } from "../../constants";
import { getFileName, getParentDir } from "./file-path-utils";

/**
 * Shared hook for debounced auto-save to file.
 * Returns a save callback that debounces writes.
 */
export function useAutoSave(
  filePath: string,
  writeFile: (file: File, targetDir?: string) => Promise<void>,
  options?: { debounceMs?: number; mimeType?: string },
): (content: string) => void {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceMs = options?.debounceMs ?? AUTO_SAVE_DEBOUNCE_MS;
  const mimeType = options?.mimeType ?? "text/plain";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (content: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const fileName = getFileName(filePath);
        const blob = new Blob([content], { type: mimeType });
        const file = new File([blob], fileName, { type: mimeType });
        const targetDir = getParentDir(filePath);
        writeFile(file, targetDir);
      }, debounceMs);
    },
    [filePath, writeFile, debounceMs, mimeType],
  );
}
