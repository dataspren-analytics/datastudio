import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { parseCTEs } from "../lib/parse-cte";

interface DefinitionCallbacks {
  openFile: (path: string) => void;
  filePaths: string[];
}

/**
 * Cmd+Click navigation in SQL files:
 * 1. CTE references → jump to definition (via DefinitionProvider)
 * 2. File path strings → underline on Cmd+hover, open on Cmd+Click
 */
export function useSQLDefinition(
  editorInstance: editor.IStandaloneCodeEditor | null,
  monaco: Monaco | null,
  callbacks: DefinitionCallbacks,
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!editorInstance || !monaco) return;

    let decorationIds: string[] = [];
    let disposed = false;

    // --- CTE go-to-definition ---
    const defProvider = monaco.languages.registerDefinitionProvider("sql", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideDefinition(model: any, position: any) {
        const content = model.getValue() as string;
        const line = model.getLineContent(position.lineNumber) as string;
        const col = (position.column as number) - 1;

        // Skip if cursor is inside a string literal
        if (isInsideString(line, col)) return null;

        const parseResult = parseCTEs(content);
        if (!parseResult) return null;

        const word = getWordAt(line, col);
        if (!word) return null;

        const cte = parseResult.ctes.find(
          (c) => c.name.toLowerCase() === word.text.toLowerCase(),
        );
        if (!cte) return null;

        return {
          uri: model.uri,
          range: {
            startLineNumber: cte.startLine,
            startColumn: 1,
            endLineNumber: cte.startLine,
            endColumn: cte.name.length + 1,
          },
        };
      },
    });

    // --- File paths: underline on Cmd+hover, open on Cmd+Click ---

    /** Find the file-path link at a given editor position, if any. */
    function resolveFileLink(
      lineNumber: number,
      column: number,
    ): { match: string; start: number; end: number } | null {
      const model = editorInstance!.getModel();
      if (!model) return null;

      const line = model.getLineContent(lineNumber);
      const col = column - 1; // 0-based

      const str = getStringAt(line, col);
      if (!str) return null;

      const { filePaths } = callbacksRef.current;
      const match =
        filePaths.find((p) => p === str.content) ??
        filePaths.find((p) => p.endsWith("/" + str.content));

      if (!match) return null;
      return { match, start: str.start, end: str.end };
    }

    // Show underline decoration when Cmd+hovering over a file path string
    const mouseMoveSub = editorInstance.onMouseMove((e) => {
      if (disposed) return;

      const isCmd = e.event.metaKey || e.event.ctrlKey;
      const pos = e.target.position;

      if (!isCmd || !pos) {
        if (decorationIds.length > 0) {
          decorationIds = editorInstance!.deltaDecorations(decorationIds, []);
        }
        return;
      }

      const link = resolveFileLink(pos.lineNumber, pos.column);
      if (link) {
        decorationIds = editorInstance!.deltaDecorations(decorationIds, [
          {
            range: {
              startLineNumber: pos.lineNumber,
              // +1 for 1-based, include the opening quote
              startColumn: link.start,
              endLineNumber: pos.lineNumber,
              // +1 to include closing quote
              endColumn: link.end + 2,
            },
            options: {
              inlineClassName: "detected-link-active",
            },
          },
        ]);
      } else if (decorationIds.length > 0) {
        decorationIds = editorInstance!.deltaDecorations(decorationIds, []);
      }
    });

    // Clear decorations when Cmd key is released
    const keyUpSub = editorInstance.onKeyUp((e) => {
      if (disposed) return;
      if (e.keyCode === monaco!.KeyCode.Meta || e.keyCode === monaco!.KeyCode.Ctrl) {
        if (decorationIds.length > 0) {
          decorationIds = editorInstance!.deltaDecorations(decorationIds, []);
        }
      }
    });

    // Open file on Cmd+Click
    const mouseDownSub = editorInstance.onMouseDown((e) => {
      if (disposed) return;
      const isCmd = e.event.metaKey || e.event.ctrlKey;
      if (!isCmd) return;

      const pos = e.target.position;
      if (!pos) return;

      const link = resolveFileLink(pos.lineNumber, pos.column);
      if (link) {
        e.event.preventDefault();
        e.event.stopPropagation();
        // Defer to next microtask so the editor doesn't process
        // the click further (prevents the Canceled error).
        queueMicrotask(() => {
          if (!disposed) {
            callbacksRef.current.openFile(link.match);
          }
        });
      }
    });

    return () => {
      disposed = true;
      defProvider.dispose();
      mouseMoveSub.dispose();
      keyUpSub.dispose();
      mouseDownSub.dispose();
      if (decorationIds.length > 0) {
        editorInstance.deltaDecorations(decorationIds, []);
      }
    };
  }, [editorInstance, monaco]);
}

/** Extract the word (identifier) at a 0-based column. */
function getWordAt(
  line: string,
  col: number,
): { text: string; start: number; end: number } | null {
  if (col < 0 || col >= line.length) return null;
  if (!/\w/.test(line[col])) return null;

  let start = col;
  while (start > 0 && /\w/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length - 1 && /\w/.test(line[end + 1])) end++;

  return { text: line.slice(start, end + 1), start, end };
}

/** Check if a 0-based column is inside a single-quoted string. */
function isInsideString(line: string, col: number): boolean {
  let inString = false;
  let stringStart = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'" && !inString) {
      inString = true;
      stringStart = i + 1;
    } else if (line[i] === "'" && inString) {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i++;
        continue;
      }
      if (col >= stringStart && col < i) return true;
      inString = false;
    }
    if (line[i] === "-" && i + 1 < line.length && line[i + 1] === "-") break;
  }
  return false;
}

/** If 0-based col is inside a single-quoted string, return its content and span. */
function getStringAt(
  line: string,
  col: number,
): { content: string; start: number; end: number } | null {
  let inString = false;
  let stringStart = -1;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'" && !inString) {
      inString = true;
      stringStart = i + 1;
    } else if (line[i] === "'" && inString) {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i++;
        continue;
      }
      if (col >= stringStart && col < i) {
        return { content: line.slice(stringStart, i), start: stringStart, end: i };
      }
      inString = false;
    }
    if (line[i] === "-" && i + 1 < line.length && line[i + 1] === "-") break;
  }

  return null;
}
