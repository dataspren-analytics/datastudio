"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink, Loader2, Moon, RotateCcw, Sun } from "lucide-react";
import { useEffect } from "react";
import { useRuntime } from "./provider/runtime-provider";
import { useAppStore, selectIsDarkMode, selectSetDarkMode } from "./store";

export function DataStudioHeader() {
  const runtime = useRuntime();
  const isDark = useAppStore(selectIsDarkMode);
  const setDarkMode = useAppStore(selectSetDarkMode);

  // Sync dark mode class with document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-border bg-white dark:bg-background">
      <div className="flex items-center gap-4">
        <a href="/" className="flex items-center shrink-0">
          <img
            src="/brand-assets/logo.svg"
            alt="DataSpren"
            width={120}
            height={20}
            className="h-5 pointer-events-none dark:invert"
            draggable={false}
          />
        </a>
      </div>

      <div className="flex items-center gap-1">
        {/* Runtime status */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs"
          title={runtime.isReady ? "Runtime ready" : "Loading runtime..."}
        >
          {runtime.isReady ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">Ready</span>
            </>
          ) : (
            <>
              <Loader2 size={12} className="animate-spin text-stone-400 dark:text-neutral-500" />
              <span className="text-stone-400 dark:text-neutral-500">Loading...</span>
            </>
          )}
        </div>

        <a
          href="https://duckdb.org/docs/stable/sql/query_syntax/select"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 text-xs text-stone-500 hover:text-stone-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
        >
          <span>DuckDB Docs</span>
          <ExternalLink size={10} />
        </a>

        <div className="h-4 w-px bg-stone-200 dark:bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => runtime.reset()}
              className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-accent rounded transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset runtime</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-stone-200 dark:bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setDarkMode(!isDark)}
              className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-accent rounded transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
