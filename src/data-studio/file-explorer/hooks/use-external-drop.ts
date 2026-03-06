import { useEffect, useRef, useState } from "react";
import type { RuntimeContextValue } from "../../provider/runtime-provider";
import { LOCAL_MOUNT } from "../../lib/paths";

export function useExternalDrop(runtime: RuntimeContextValue) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isSidebarDragOver, setIsSidebarDragOver] = useState(false);
  const [externalDropTargetDir, setExternalDropTargetDir] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const lastExternalTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const resolveTargetDir = (target: EventTarget | null): string => {
      const dirEl = (target as HTMLElement | null)?.closest?.("[data-dir-path]");
      return (dirEl as HTMLElement | null)?.dataset?.dirPath ?? LOCAL_MOUNT;
    };

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dragCounterRef.current++;
        setIsSidebarDragOver(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        const dir = resolveTargetDir(e.target);
        if (dir !== lastExternalTargetRef.current) {
          lastExternalTargetRef.current = dir;
          setExternalDropTargetDir(dir);
        }
      }
    };

    const onDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsSidebarDragOver(false);
        lastExternalTargetRef.current = null;
        setExternalDropTargetDir(null);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const targetDir = resolveTargetDir(e.target);
      dragCounterRef.current = 0;
      setIsSidebarDragOver(false);
      lastExternalTargetRef.current = null;
      setExternalDropTargetDir(null);

      if (!e.dataTransfer?.files.length) return;

      const files = Array.from(e.dataTransfer.files).filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const hasExtension = file.name.includes(".");
        return ext === "csv" || ext === "parquet" || ext === "json" || ext === "xlsx" || ext === "xls" || ext === "md" || ext === "txt" || ext === "sql" || ext === "ipynb" || !hasExtension;
      });

      for (const file of files) {
        await runtime.writeFile(file, targetDir);
      }
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [runtime]);

  return { sidebarRef, isSidebarDragOver, externalDropTargetDir };
}
