import { useEffect } from "react";
import { useStoreApi } from "../store";

export function useKeyboardShortcuts() {
  const store = useStoreApi();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.shiftKey || e.metaKey)) {
        const { selectedCellId, runCellAndAdvance } = store.getState();
        if (!selectedCellId) return;

        const target = e.target as HTMLElement;
        if (!target.closest?.(".monaco-editor")) {
          e.preventDefault();
          runCellAndAdvance(selectedCellId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);
}
