"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useRuntime } from "./provider/runtime-provider";

interface DataStudioLayoutProps {
  header: ReactNode;
  fileExplorer: ReactNode;
  content: ReactNode;
}

export function DataStudioLayout({ header, fileExplorer, content }: DataStudioLayoutProps) {
  const runtime = useRuntime();

  if (runtime.error) {
    return (
      <div className="h-svh flex items-center justify-center bg-[#1a1a1f]">
        <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
          <AlertTriangle size={24} className="text-red-400" />
          <p className="text-sm text-neutral-300">Runtime error</p>
          <p className="text-xs text-neutral-500 font-mono break-all">{runtime.error}</p>
          <button
            onClick={() => runtime.reset()}
            className="mt-2 px-3 py-1.5 text-xs rounded bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition-colors"
          >
            Restart runtime
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-svh flex flex-col bg-white dark:bg-background">
      {header}
      <div className="flex flex-1 overflow-hidden">
        {fileExplorer}
        {content}
      </div>
    </div>
  );
}
