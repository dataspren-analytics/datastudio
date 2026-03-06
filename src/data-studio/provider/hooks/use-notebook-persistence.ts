import { useCallback, useEffect, useRef } from "react";
import { writeNotebook as writeNotebookUtil } from "../../runtime/notebook-utils";
import type { IRuntimeFileSystem } from "../../runtime/backends/execution/interface";
import type { NotebookEntry } from "../notebook-provider";

/**
 * Batched notebook persistence — schedules writes to OPFS with deduplication
 * and flush-on-unmount semantics.
 */
export function useNotebookPersistence(
  execution: IRuntimeFileSystem,
  ephemeral: boolean,
) {
  const pendingSaves = useRef<Map<string, NotebookEntry>>(new Map());
  const deletedPaths = useRef<Set<string>>(new Set());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);

  const flushPendingSaves = useCallback(async () => {
    if (ephemeral || pendingSaves.current.size === 0 || isFlushingRef.current) return;

    isFlushingRef.current = true;
    try {
      const toSave = Array.from(pendingSaves.current.values()).filter(
        (n) => !deletedPaths.current.has(n.filePath),
      );
      pendingSaves.current.clear();
      await Promise.all(
        toSave.map((n) =>
          writeNotebookUtil(execution, n.filePath, n.document, { silent: true }),
        ),
      );
    } finally {
      isFlushingRef.current = false;
      if (pendingSaves.current.size > 0) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => flushPendingSaves(), 100);
      }
    }
  }, [ephemeral, execution]);

  const scheduleSave = useCallback(
    (entry: NotebookEntry) => {
      pendingSaves.current.set(entry.filePath, entry);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => flushPendingSaves(), 500);
    },
    [flushPendingSaves],
  );

  const markDeleted = useCallback((filePath: string) => {
    deletedPaths.current.add(filePath);
    pendingSaves.current.delete(filePath);
  }, []);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (pendingSaves.current.size > 0) {
        flushPendingSaves();
      }
    };
  }, [flushPendingSaves]);

  return { scheduleSave, flushPendingSaves, markDeleted };
}
