"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

interface CellToolbarActionsProps {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function CellToolbarActions({
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: CellToolbarActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMoveUp();
        }}
        disabled={isFirst}
        className="p-1.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move cell up"
      >
        <ArrowUp size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMoveDown();
        }}
        disabled={isLast}
        className="p-1.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move cell down"
      >
        <ArrowDown size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-950 rounded transition-colors"
        title="Delete cell"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
