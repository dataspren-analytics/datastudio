import type { FileTreeNode } from "../lib/types";
import { FileIconForName } from "../lib/file-tree-utils";

export function DragOverlayItem({ node }: { node: FileTreeNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-xs bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700">
      <FileIconForName name={node.name} size={12} className="text-neutral-500 shrink-0" />
      <span className="font-medium text-neutral-700 dark:text-neutral-300 text-xs">
        {node.name}
      </span>
    </div>
  );
}
