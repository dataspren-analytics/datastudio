import { useCallback, useRef, useState } from "react";
import type { FileTreeNode, ContextMenuState } from "../lib/types";

export function useFileContextMenu(
  selectedPaths: Set<string>,
  clearSelection: () => void,
) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextKeyRef = useRef(0);

  const handleNodeContextMenu = useCallback(
    (node: FileTreeNode, x: number, y: number) => {
      contextKeyRef.current++;
      const snapshotSelection = selectedPaths.has(node.path)
        ? selectedPaths
        : new Set<string>();
      if (!snapshotSelection.size) {
        clearSelection();
      }
      setContextMenu({ node, x, y, key: contextKeyRef.current, selectedPaths: snapshotSelection });
    },
    [selectedPaths, clearSelection],
  );

  return { contextMenu, setContextMenu, handleNodeContextMenu };
}
