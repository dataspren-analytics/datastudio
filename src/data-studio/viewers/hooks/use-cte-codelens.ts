import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { parseCTEs, buildCTEQuery, type CTEParseResult } from "../lib/parse-cte";

const GLYPH_CLASS = "cte-run-glyph";

/**
 * Shows a ▶ play button in the glyph margin next to each CTE definition.
 * Clicking it runs the CTE with all its dependencies resolved.
 */
export function useCTECodeLens(
  editorInstance: editor.IStandaloneCodeEditor | null,
  monaco: Monaco | null,
  onRunCTE: (cteName: string, sql: string) => void,
): void {
  const onRunCTERef = useRef(onRunCTE);
  onRunCTERef.current = onRunCTE;

  useEffect(() => {
    if (!editorInstance || !monaco) return;

    let decorationIds: string[] = [];
    let parseResult: CTEParseResult | null = null;

    injectGlyphStyles();

    function updateDecorations() {
      const model = editorInstance!.getModel();
      if (!model) return;

      const content = model.getValue();
      parseResult = parseCTEs(content);

      if (!parseResult || parseResult.ctes.length === 0) {
        decorationIds = editorInstance!.deltaDecorations(decorationIds, []);
        return;
      }

      const newDecorations = parseResult.ctes.map((cte) => ({
        range: {
          startLineNumber: cte.startLine,
          startColumn: 1,
          endLineNumber: cte.startLine,
          endColumn: 1,
        },
        options: {
          glyphMarginClassName: GLYPH_CLASS,
        },
      }));

      decorationIds = editorInstance!.deltaDecorations(
        decorationIds,
        newDecorations,
      );
    }

    updateDecorations();
    const contentSub = editorInstance.onDidChangeModelContent(() => {
      updateDecorations();
    });

    // Click on glyph margin → run CTE
    const mouseDownSub = editorInstance.onMouseDown((e) => {
      if (
        e.target.type !== monaco!.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        e.target.type !== monaco!.editor.MouseTargetType.GUTTER_LINE_DECORATIONS
      ) {
        return;
      }

      if (!parseResult || !e.target.position) return;

      const lineNumber = e.target.position.lineNumber;
      const cte = parseResult.ctes.find((c) => c.startLine === lineNumber);
      if (!cte) return;

      const sql = buildCTEQuery(cte.name, parseResult);
      onRunCTERef.current(cte.name, sql);
    });

    return () => {
      contentSub.dispose();
      mouseDownSub.dispose();
      editorInstance.deltaDecorations(decorationIds, []);
    };
  }, [editorInstance, monaco]);
}

let stylesInjected = false;

function injectGlyphStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .monaco-editor .line-numbers {
      font-size: 12px !important;
    }
    .monaco-editor .${GLYPH_CLASS} {
      cursor: pointer;
      opacity: 0.35;
      transition: opacity 0.15s;
    }
    .monaco-editor .${GLYPH_CLASS}::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 15px;
      height: 15px;
      background-color: #22c55e;
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='6 3 20 12 6 21 6 3'/%3E%3C/svg%3E");
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='6 3 20 12 6 21 6 3'/%3E%3C/svg%3E");
      -webkit-mask-size: contain;
      mask-size: contain;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
    }
    .monaco-editor .${GLYPH_CLASS}:hover {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}
