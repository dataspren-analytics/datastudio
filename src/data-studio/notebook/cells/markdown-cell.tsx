"use client";

import { cn } from "@/lib/utils";
import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { getSourceString, type MarkdownCell } from "../../runtime";
import { useStore, selectIsDarkMode } from "../store";
import { editorTheme, editorThemeDarkOverride } from "../constants";
import { CellToolbarActions } from "./cell-toolbar-actions";
import { CellWrapper } from "./cell-wrapper";

export interface MarkdownCellProps {
  cell: MarkdownCell;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (source: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function MarkdownCell({
  cell,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: MarkdownCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const source = getSourceString(cell.source);
  const isDark = useStore(selectIsDarkMode);
  const editorRef = useRef<HTMLDivElement>(null);

  // Exit edit mode when cell is deselected
  useEffect(() => {
    if (!isSelected && isEditing) {
      setIsEditing(false);
    }
  }, [isSelected, isEditing]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleEditorChange = useCallback(
    (value: string) => {
      onUpdate(value);
    },
    [onUpdate],
  );

  const exitEditMode = useCallback(() => {
    setIsEditing(false);
  }, []);

  const shiftEnterBinding = Prec.highest(
    keymap.of([
      {
        key: "Shift-Enter",
        run: () => {
          exitEditMode();
          return true;
        },
      },
      {
        key: "Escape",
        run: () => {
          exitEditMode();
          return true;
        },
      },
    ]),
  );

  const extensions = [
    markdown(),
    shiftEnterBinding,
    EditorView.lineWrapping,
    isDark ? editorThemeDarkOverride : editorTheme,
    ...(isDark ? [oneDark] : []),
  ];

  if (isEditing) {
    return (
      <CellWrapper isSelected={isSelected} onSelect={onSelect}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            Markdown
          </span>
          <CellToolbarActions
            isFirst={isFirst}
            isLast={isLast}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </div>
        <div ref={editorRef}>
          <CodeMirror
            value={source}
            onChange={handleEditorChange}
            extensions={extensions}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              bracketMatching: false,
              autocompletion: false,
            }}
            className="text-sm"
            autoFocus
          />
        </div>
      </CellWrapper>
    );
  }

  // View mode — rendered markdown (no card background)
  const isEmpty = !source.trim();

  return (
    <div
      className="group relative"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="absolute right-2 top-0 z-10">
        <CellToolbarActions
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      </div>
      <div
        className={cn(
          "py-1 rounded-lg cursor-text transition-colors",
          isSelected && "ring-1 ring-neutral-300 dark:ring-neutral-600",
        )}
        onDoubleClick={handleDoubleClick}
      >
        {isEmpty ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 italic py-2">
            Double-click to edit markdown...
          </p>
        ) : (
          <div className={cn(
            "prose prose-base dark:prose-invert max-w-none py-1",
            "prose-headings:font-semibold prose-headings:tracking-tight",
            "prose-h1:text-2xl prose-h1:mb-3 prose-h1:mt-0",
            "prose-h2:text-xl prose-h2:mb-2 prose-h2:mt-0",
            "prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-0",
            "prose-p:text-base prose-p:leading-relaxed prose-p:my-1.5",
            "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
            "prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800",
            "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-xs",
            "prose-a:text-blue-600 dark:prose-a:text-blue-400",
            "prose-strong:font-semibold",
            "prose-blockquote:border-neutral-300 dark:prose-blockquote:border-neutral-600",
          )}>
            <Markdown>{source}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
