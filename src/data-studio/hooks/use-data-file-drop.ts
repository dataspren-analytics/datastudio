import { useCallback, useRef, useState } from "react";
import type { MonacoEditorHandle } from "../components/monaco-code-editor";

type ResolveColumns = (filePath: string) => Promise<string[]>;

export function useDataFileDrop(
  editorRef: React.RefObject<MonacoEditorHandle | null>,
  resolveColumns?: ResolveColumns,
) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);
  const altHeldRef = useRef(false);
  
  // We use "application/x-data-file-path" in file-tree-node to register the data
  const dataFileMime = "application/x-data-file-path";

  const hasDataFile = (dt: DataTransfer | null) => dt?.types.includes(dataFileMime) ?? false;

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasDataFile(e.dataTransfer)) return;
    e.preventDefault();
    counterRef.current++;
    setIsDragOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasDataFile(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    altHeldRef.current = e.altKey;
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasDataFile(e.dataTransfer)) return;
    e.preventDefault();
    counterRef.current--;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const onDropCapture = useCallback(
    async (e: React.DragEvent) => {
      const filePath = e.dataTransfer.getData(dataFileMime);
      if (!filePath) return;

      e.preventDefault();
      e.stopPropagation();
      counterRef.current = 0;
      setIsDragOver(false);

      // Clean up Monaco's drop cursor (it never sees the drop event).
      (e.target as HTMLElement).dispatchEvent(
        new DragEvent("dragleave", { bubbles: true }),
      );

      const coords = { x: e.clientX, y: e.clientY };

      if (altHeldRef.current && resolveColumns) {
        try {
          const columns = await resolveColumns(filePath);
          if (columns.length > 0) {
            const colList = columns.map((c) => `"${c}"`).join(",\n  ");
            editorRef.current?.insertAtCursor(
              `SELECT\n  ${colList}\nFROM '${filePath}'`,
              coords,
            );
            return;
          }
        } catch {
          // fall through to SELECT *
        }
      }

      editorRef.current?.insertAtCursor(`SELECT * FROM '${filePath}'`, coords);
    },
    [editorRef, resolveColumns],
  );

  return {
    isDragOver,
    dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDropCapture },
  };
}
