"use client";

import { Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { MonacoCodeEditor, type EditorLanguage } from "../components/monaco-code-editor";
import { useAppStore, selectIsDarkMode } from "../store";
import { useFileLoader } from "./hooks/use-file-loader";
import { useAutoSave } from "./hooks/use-auto-save";
import type { FileViewerProps } from "./types";

function getEditorLanguage(filePath: string): EditorLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "md") return "markdown";
  return "plaintext";
}

interface TextRuntimeActions {
  readFile: (name: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
}

interface TextFileViewerInnerProps {
  filePath: string;
  runtimeActions: TextRuntimeActions;
}

const TextFileViewerInner = memo(function TextFileViewerInner({
  filePath,
  runtimeActions,
}: TextFileViewerInnerProps) {
  const isDark = useAppStore(selectIsDarkMode);
  const [content, setContent] = useState("");

  const loadFn = useCallback((data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    setContent(text);
    return { content: text };
  }, []);

  const state = useFileLoader(filePath, loadFn, runtimeActions.readFile);
  const save = useAutoSave(filePath, runtimeActions.writeFile);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      save(value);
    },
    [save],
  );

  const language = getEditorLanguage(filePath);

  if (state.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">{state.message}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-hidden">
      <MonacoCodeEditor
        defaultValue={content}
        onChange={handleChange}
        language={language}
        isDark={isDark}
        enableScrolling
        showLineNumbers
        resetKey={filePath}
      />
    </div>
  );
});

export function TextFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<TextRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
    }),
    [runtime.readFile, runtime.writeFile],
  );

  return (
    <TextFileViewerInner
      filePath={filePath}
      runtimeActions={runtimeActions}
    />
  );
}
