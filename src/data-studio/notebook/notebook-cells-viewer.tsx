"use client";

import { Plus } from "lucide-react";
import React from "react";
import { AddCellDivider } from "./cells/add-cell-divider";
import { CellWrapperConnected } from "./cells/cell-wrapper-connected";
import { useCellIds } from "./hooks/use-cell-ids";
import { useCellActions } from "./hooks/use-cell-actions";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";

export function NotebookCellsViewer() {
  const cellIds = useCellIds();
  const { selectCell, addCell } = useCellActions();

  useKeyboardShortcuts();

  return (
    <div
      className="flex-1 min-w-0 overflow-y-auto bg-stone-50 dark:bg-background"
      onClick={() => selectCell(null)}
      onMouseDown={() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }}
    >
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-4 overflow-hidden">
        {cellIds.map((id, index) => {
          const isFirst = index === 0;
          const isLast = index === cellIds.length - 1;

          return (
            <React.Fragment key={id}>
              <CellWrapperConnected
                id={id}
                isFirst={isFirst}
                isLast={isLast}
              />
              {!isLast && (
                <AddCellDivider onAddCell={(type) => addCell(type, id)} />
              )}
            </React.Fragment>
          );
        })}

        <button
          onClick={(e) => {
            e.stopPropagation();
            addCell("python");
          }}
          className="w-full py-3 border border-dashed border-stone-300 dark:border-neutral-700 rounded-lg text-stone-500 dark:text-neutral-500 hover:text-stone-700 dark:hover:text-neutral-300 hover:border-stone-400 dark:hover:border-neutral-600 hover:bg-stone-100 dark:hover:bg-neutral-900 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Add cell
        </button>
      </div>
    </div>
  );
}
