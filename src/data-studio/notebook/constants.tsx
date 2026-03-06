import { EditorView } from "@codemirror/view";
import { Database, TextCursorInput } from "lucide-react";
import type { AssertTestType, CodeCell } from "../runtime";
import { generateId } from "./utils";

export const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "#0a0a0a",
    fontFamily: "Menlo, Monaco, Consolas, ui-monospace, monospace",
    fontVariantLigatures: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#0a0a0a",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#fef6f0",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-line": {
    paddingLeft: "2px",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
  },
});

// Override to make the editor background transparent (inherits from card)
export const editorThemeDarkOverride = EditorView.theme({
  "&": {
    backgroundColor: "transparent !important",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    fontFamily: "Menlo, Monaco, Consolas, ui-monospace, monospace",
    fontVariantLigatures: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
    backgroundColor: "transparent",
  },
  ".cm-line": {
    paddingLeft: "2px",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
  },
}, { dark: true });

const PythonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
    <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
  </svg>
);

export type SelectableCellType = "python" | "sql" | "markdown";

export const cellTypeConfig: Record<
  SelectableCellType,
  {
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    color: string;
    checkColor: string;
  }
> = {
  python: {
    label: "Python",
    icon: PythonIcon,
    color: "bg-blue-500/70",
    checkColor: "text-blue-500",
  },
  sql: {
    label: "SQL",
    icon: Database,
    color: "bg-emerald-500/70",
    checkColor: "text-emerald-500",
  },
  markdown: {
    label: "Markdown",
    icon: TextCursorInput,
    color: "bg-neutral-500/70",
    checkColor: "text-neutral-500",
  },
};

export const assertTestTypeConfig: Record<AssertTestType, { label: string; description: string }> =
  {
    unique: { label: "Unique", description: "No duplicate values" },
    not_null: { label: "Not Null", description: "No NULL values" },
    accepted_values: { label: "Accepted Values", description: "Only allowed values" },
    custom_sql: { label: "Custom SQL", description: "Custom assertion query" },
  };

export const initialCells: CodeCell[] = [
  {
    id: generateId(),
    cell_type: "code",
    source: [
      "@sql_func\n",
      "def my_rounder(num: float) -> str:\n",
      '    return "Rounded in python: " + str(round(num, 2))',
    ],
    outputs: [],
    execution_count: null,
    metadata: {},
  },
  {
    id: generateId(),
    cell_type: "code",
    source: ["%sql\n", 'select * from "eto-map-of-science.csv" limit 3'],
    outputs: [],
    execution_count: null,
    metadata: { viewName: "t1" },
  },
  {
    id: generateId(),
    cell_type: "code",
    source: [
      "%sql\n",
      'select count(*) as count, my_rounder(sum("Cluster size")/count(*)) as average from t1',
    ],
    outputs: [],
    execution_count: null,
    metadata: { viewName: "t2" },
  },
];
