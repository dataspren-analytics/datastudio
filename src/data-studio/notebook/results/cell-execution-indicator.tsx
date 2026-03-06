"use client";

import { Loader2 } from "lucide-react";

interface CellExecutionIndicatorProps {
  isQueued: boolean;
  isRunning: boolean;
  runningLabel?: string;
}

export function CellExecutionIndicator({
  isQueued,
  isRunning,
  runningLabel = "Running...",
}: CellExecutionIndicatorProps) {
  if (isQueued) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400 dark:text-neutral-500 px-3 py-2">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-400/50 dark:border-neutral-600/50 border-dashed animate-spin" />
        <span>Queued</span>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400 dark:text-neutral-500 px-3 py-2">
        <Loader2 size={14} className="animate-spin" />
        <span>{runningLabel}</span>
      </div>
    );
  }

  return null;
}
