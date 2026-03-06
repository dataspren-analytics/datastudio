import { useCallback, useState } from "react";

export function useFileSelection(
  flatVisibleNodes: string[],
  selectFile: (path: string | null) => void,
  togglePath: (path: string) => void,
) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  const handleNodeSelect = useCallback(
    (path: string, isDirectory: boolean, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      if (modifiers.shiftKey && lastSelectedPath) {
        const anchorIdx = flatVisibleNodes.indexOf(lastSelectedPath);
        const targetIdx = flatVisibleNodes.indexOf(path);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          setSelectedPaths(new Set(flatVisibleNodes.slice(start, end + 1)));
          return;
        }
      }

      if (modifiers.metaKey || modifiers.ctrlKey) {
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
        setLastSelectedPath(path);
        return;
      }

      clearSelection();
      setLastSelectedPath(path);
      if (isDirectory) {
        togglePath(path);
      } else {
        selectFile(path);
      }
    },
    [lastSelectedPath, flatVisibleNodes, clearSelection, selectFile, togglePath],
  );

  return { selectedPaths, lastSelectedPath, clearSelection, handleNodeSelect };
}
