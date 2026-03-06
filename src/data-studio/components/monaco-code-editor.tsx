"use client";

import { Editor, type OnMount, type Monaco } from "@monaco-editor/react";
import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { editor } from "monaco-editor";

export type EditorLanguage = "sql" | "python" | "json" | "markdown" | "plaintext";

let themesRegistered = false;

function registerThemes(monaco: Monaco) {
  if (themesRegistered) return;
  themesRegistered = true;

  const sharedRules = [
    { token: "comment", foreground: "6a737d" },
    { token: "keyword", foreground: "ea6045", fontStyle: "bold" },
    { token: "function", foreground: "b3d97e" },
    { token: "function.python", foreground: "b3d97e" },
    { token: "predefined", foreground: "b3d97e" },
    { token: "predefined.sql", foreground: "b3d97e" },
    { token: "predefined.python", foreground: "b3d97e" },
    { token: "type.sql", foreground: "b3d97e" },
    { token: "identifier.function", foreground: "b3d97e" },
    { token: "support.function", foreground: "b3d97e" },
    { token: "builtin", foreground: "b3d97e" },
    { token: "builtin.python", foreground: "b3d97e" },
    { token: "identifier.builtin", foreground: "b3d97e" },
    { token: "identifier.callable", foreground: "b3d97e" },
    { token: "meta.function-call", foreground: "b3d97e" },
    { token: "entity.name.function", foreground: "b3d97e" },
  ];

  monaco.editor.defineTheme("custom-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      ...sharedRules,
      { token: "number", foreground: "79c0ff" },
      { token: "string", foreground: "e5c07b" },
      { token: "string.sql", foreground: "e5c07b" },
      { token: "string.quoted", foreground: "e5c07b" },
      { token: "string.single", foreground: "e5c07b" },
      { token: "string.double", foreground: "e5c07b" },
      { token: "operator", foreground: "e0e0e0" },
      { token: "delimiter", foreground: "e0e0e0" },
      { token: "variable", foreground: "e0e0e0" },
      { token: "type", foreground: "d2a8ff" },
      { token: "identifier", foreground: "e0e0e0" },
      { token: "", foreground: "e0e0e0" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editor.lineHighlightBackground": "#ffffff0a",
    },
  });

  monaco.editor.defineTheme("custom-light", {
    base: "vs",
    inherit: true,
    rules: [
      ...sharedRules,
      { token: "number", foreground: "005cc5" },
      { token: "string", foreground: "b5760a" },
      { token: "string.sql", foreground: "b5760a" },
      { token: "string.quoted", foreground: "b5760a" },
      { token: "string.single", foreground: "b5760a" },
      { token: "string.double", foreground: "b5760a" },
      { token: "operator", foreground: "24292e" },
      { token: "delimiter", foreground: "24292e" },
      { token: "variable", foreground: "24292e" },
      { token: "type", foreground: "6f42c1" },
      { token: "identifier", foreground: "24292e" },
      { token: "", foreground: "24292e" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editor.lineHighlightBackground": "#00000008",
    },
  });
}

export interface MonacoCodeEditorProps {
  defaultValue: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  isDark?: boolean;
  enableScrolling?: boolean;
  showLineNumbers?: boolean;
  highlightActiveLine?: boolean;
  minHeight?: number;
  resetKey?: string;
  autoFocus?: boolean;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
}

export interface MonacoEditorHandle {
  getContent: () => string;
  getSelection: () => string | null;
  focus: () => void;
  replaceContent: (text: string) => void;
}

export const MonacoCodeEditor = forwardRef<MonacoEditorHandle, MonacoCodeEditorProps>(
  function MonacoCodeEditor(
    {
      defaultValue,
      onChange,
      language,
      isDark = true,
      enableScrolling = false,
      showLineNumbers = false,
      highlightActiveLine = false,
      minHeight = 80,
      resetKey,
      autoFocus = false,
      onMount: onMountProp,
    },
    ref
  ) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const autoFocusRef = useRef(autoFocus);
    autoFocusRef.current = autoFocus;

    useImperativeHandle(ref, () => ({
      getContent: () => {
        const model = editorRef.current?.getModel();
        return model?.getValue() || "";
      },
      getSelection: () => {
        const ed = editorRef.current;
        if (!ed) return null;
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (selection && model && !selection.isEmpty()) {
          return model.getValueInRange(selection);
        }
        return null;
      },
      focus: () => {
        editorRef.current?.focus();
      },
      replaceContent: (text: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        if (model.getValue() === text) return;
        const selections = ed.getSelections();
        ed.executeEdits("external", [{
          range: model.getFullModelRange(),
          text,
          forceMoveMarkers: true,
        }], selections ?? undefined);
        ed.pushUndoStop();
      },
    }));

    const containerRef = useRef<HTMLDivElement | null>(null);
    const initialHeight = enableScrolling
      ? 0
      : Math.max(minHeight, Math.max((defaultValue || "").split("\n").length, 1) * 21 + 16);
    const heightRef = useRef(initialHeight);

    const handleEditorDidMount: OnMount = useCallback(
      (editor, monaco) => {
        editorRef.current = editor;

        registerThemes(monaco);
        monaco.editor.setTheme(isDark ? "custom-dark" : "custom-light");

        if (!enableScrolling) {
          const applyHeight = (h: number) => {
            const clamped = Math.max(minHeight, h);
            heightRef.current = clamped;
            if (containerRef.current) {
              containerRef.current.style.height = `${clamped}px`;
            }
            editor.layout();
          };
          editor.onDidContentSizeChange((e) => {
            if (e.contentHeightChanged) {
              applyHeight(e.contentHeight);
              editor.setScrollTop(0);
            }
          });
        }

        if (autoFocusRef.current) {
          editor.focus();
        }

        onMountProp?.(editor, monaco);
      },
      [isDark, enableScrolling, onMountProp],
    );

    const handleChange = useCallback((newValue: string | undefined) => {
      onChange?.(newValue || "");
    }, [onChange]);

    const editorOptions = {
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 21,
      fontFamily: "Menlo, ui-monospace, SFMono-Regular, Monaco, Consolas, monospace",
      lineNumbers: showLineNumbers ? ("on" as const) : ("off" as const),
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on" as const,
      wrappingIndent: "indent" as const,
      padding: { top: 0, bottom: 0 },
      suggest: { showWords: false },
      quickSuggestions: false,
      contextmenu: true,
      scrollbar: enableScrolling
        ? { vertical: "auto" as const, horizontal: "auto" as const, useShadows: false, handleMouseWheel: true }
        : { vertical: "hidden" as const, horizontal: "hidden" as const, useShadows: false, handleMouseWheel: false },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      renderLineHighlight: highlightActiveLine ? ("line" as const) : ("none" as const),
      glyphMargin: false,
      folding: false,
    };

    const editorEl = (
      <Editor
        key={resetKey}
        height="100%"
        defaultLanguage={language}
        language={language}
        defaultValue={defaultValue}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={isDark ? "custom-dark" : "custom-light"}
        options={editorOptions}
      />
    );

    if (enableScrolling) return editorEl;

    return (
      <div ref={containerRef} style={{ height: `${heightRef.current}px`, overflow: "hidden" }}>
        {editorEl}
      </div>
    );
  },
);
