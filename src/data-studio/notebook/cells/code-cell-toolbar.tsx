"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cellTypeConfig, type SelectableCellType } from "../constants";
import type { DataSprenCellType, TableInfo } from "../../runtime";
import { CellToolbarActions } from "./cell-toolbar-actions";

export interface CodeCellToolbarProps {
  cellType: "python" | "sql";
  viewName: string | undefined;
  isFirst: boolean;
  isLast: boolean;
  isRunning: boolean;
  isRuntimeReady: boolean;
  hasError: boolean;
  viewExists: boolean;
  onRun: () => void;
  onChangeType: (type: DataSprenCellType | "markdown") => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdateViewName?: (newName: string) => void;
}

export function CodeCellToolbar({
  cellType,
  viewName,
  isFirst,
  isLast,
  isRunning,
  isRuntimeReady,
  hasError,
  viewExists,
  onRun,
  onChangeType,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdateViewName,
}: CodeCellToolbarProps) {
  const [isEditingViewName, setIsEditingViewName] = useState(false);
  const [editedViewName, setEditedViewName] = useState(viewName || "");
  const viewNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingViewName && viewNameInputRef.current) {
      viewNameInputRef.current.focus();
      viewNameInputRef.current.select();
    }
  }, [isEditingViewName]);

  const handleViewNameSubmit = useCallback(() => {
    const trimmed = editedViewName.trim();
    if (trimmed && trimmed !== viewName && onUpdateViewName) {
      onUpdateViewName(trimmed);
    } else {
      setEditedViewName(viewName || "");
    }
    setIsEditingViewName(false);
  }, [editedViewName, viewName, onUpdateViewName]);

  const typeConfig = cellTypeConfig[cellType as SelectableCellType] ?? cellTypeConfig.python;

  const viewBadgeStyles = hasError
    ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
    : viewExists
      ? "text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 dark:text-emerald-300 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
      : "text-neutral-400 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700";

  return (
    <div className="relative z-20 flex items-center gap-1 px-3 py-1.5 border-b border-neutral-200/50 dark:border-border/50">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
        disabled={!isRuntimeReady || isRunning}
        className="p-1 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 dark:text-neutral-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-950 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={isRuntimeReady ? "Run cell (Shift+Enter)" : "Runtime is loading..."}
      >
        {isRunning ? <Loader2 size={14} className="animate-spin text-white" /> : <Play size={14} />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors"
          >
            <typeConfig.icon size={12} />
            <span>{typeConfig.label}</span>
            <ChevronDown size={10} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[120px]">
          {(Object.keys(cellTypeConfig) as SelectableCellType[]).map((type) => {
            const config = cellTypeConfig[type];
            return (
              <DropdownMenuItem
                key={type}
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeType(type);
                }}
                className="text-xs"
              >
                <config.icon size={12} />
                <span>{config.label}</span>
                {cellType === type && <Check size={12} className="ml-auto" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {viewName &&
        (isEditingViewName ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">View:</span>
            <input
              ref={viewNameInputRef}
              type="text"
              value={editedViewName}
              onChange={(e) => setEditedViewName(e.target.value)}
              onBlur={handleViewNameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleViewNameSubmit();
                else if (e.key === "Escape") {
                  setEditedViewName(viewName || "");
                  setIsEditingViewName(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "min-w-[80px] max-w-[200px] text-[10px] px-1.5 py-0.5 rounded border outline-none",
                hasError
                  ? "text-red-500 bg-red-500/10 border-red-500/30 focus:border-red-500/50"
                  : viewExists
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30 focus:border-emerald-500/50"
                    : "text-neutral-600 bg-neutral-50 border-neutral-200 focus:border-neutral-950/30 dark:text-neutral-300 dark:bg-muted dark:border-border dark:focus:border-ring",
              )}
            />
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditedViewName(viewName || "");
              setIsEditingViewName(true);
            }}
            className={cn("text-[10px] px-1.5 py-0.5 rounded", viewBadgeStyles)}
            title={`Click to rename view "${viewName}"`}
          >
            <span className="text-neutral-500 dark:text-neutral-300">View:</span> {viewName}
          </button>
        ))}

      <div className="flex-1" />

      <CellToolbarActions
        isFirst={isFirst}
        isLast={isLast}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
      />
    </div>
  );
}
