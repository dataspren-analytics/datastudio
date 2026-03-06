"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CellWrapperProps {
  isSelected: boolean;
  isRunning?: boolean;
  isQueued?: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}

export function CellWrapper({ isSelected, isRunning, isQueued, onSelect, className, children }: CellWrapperProps) {
  return (
    <div
      className={cn(
        "group rounded-lg border bg-white dark:bg-card outline-none",
        isRunning
          ? (isSelected ? "border-neutral-400 dark:border-white" : "border-neutral-200 dark:border-border")
          : isQueued
            ? "border-dashed border-neutral-300 dark:border-neutral-600"
            : isSelected
              ? "border-neutral-400 dark:border-white"
              : "border-neutral-200 hover:border-neutral-300 dark:border-border dark:hover:border-neutral-600",
        className,
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {children}
    </div>
  );
}
