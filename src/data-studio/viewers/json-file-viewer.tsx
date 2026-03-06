"use client";

import { FileJson, Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { MonacoCodeEditor } from "../components/monaco-code-editor";
import { useAppStore, selectIsDarkMode } from "../store";
import { useFileLoader } from "./hooks/use-file-loader";
import { useAutoSave } from "./hooks/use-auto-save";
import type { FileViewerProps } from "./types";

interface JsonRuntimeActions {
  readFile: (name: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
}

interface JsonFileViewerInnerProps {
  filePath: string;
  runtimeActions: JsonRuntimeActions;
}

const JsonFileViewerInner = memo(function JsonFileViewerInner({
  filePath,
  runtimeActions,
}: JsonFileViewerInnerProps) {
  const isDark = useAppStore(selectIsDarkMode);
  const [content, setContent] = useState("");

  const loadFn = useCallback((data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      setContent(formatted);
      return { content: formatted };
    } catch {
      setContent(text);
      return { content: text };
    }
  }, []);

  const state = useFileLoader(filePath, loadFn, runtimeActions.readFile);
  const save = useAutoSave(filePath, runtimeActions.writeFile, { mimeType: "application/json" });

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      save(value);
    },
    [save],
  );

  if (state.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex flex-col items-center justify-center h-full text-neutral-500 gap-2">
        <FileJson size={32} className="text-neutral-300 dark:text-neutral-600" />
        <span>Failed to load JSON</span>
        <span className="text-xs text-red-500 font-mono">{state.message}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-hidden">
      <MonacoCodeEditor
        defaultValue={content}
        onChange={handleChange}
        language="json"
        isDark={isDark}
        enableScrolling
        showLineNumbers
        resetKey={filePath}
      />
    </div>
  );
});

export function JsonFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<JsonRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
    }),
    [runtime.readFile, runtime.writeFile],
  );

  return (
    <JsonFileViewerInner
      filePath={filePath}
      runtimeActions={runtimeActions}
    />
  );
}
