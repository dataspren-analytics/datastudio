/**
 * Jupyter Notebook Format (nbformat v4.5) types and utilities.
 *
 * This file contains all types and functions related to the Jupyter notebook
 * file format. These are used for serialization/deserialization of .ipynb files.
 *
 * See: https://nbformat.readthedocs.io/en/latest/format_description.html
 */

import { generateId } from "../../notebook/utils";

// ============================================================================
// Base Types (Jupyter standard)
// ============================================================================

/** Jupyter-compatible cell types */
export type CellType = "code" | "markdown" | "raw";

/**
 * Jupyter uses multiline strings as arrays of lines.
 * This allows for efficient diffing and merging.
 */
export type MultilineString = string | string[];

/**
 * MIME bundle: mime-type keyed dictionary of data.
 * All mime types use MultilineString, except application/json which can be any type.
 */
export interface MimeBundle {
  "text/plain"?: MultilineString;
  "text/html"?: MultilineString;
  "text/markdown"?: MultilineString;
  "text/latex"?: MultilineString;
  "image/png"?: MultilineString;
  "image/jpeg"?: MultilineString;
  "image/svg+xml"?: MultilineString;
  "application/json"?: unknown;
  "application/javascript"?: MultilineString;
  // Custom dataspren types
  "application/vnd.dataspren.assert+json"?: AssertResult[];
  // Allow any other mime types
  [mimeType: string]: MultilineString | unknown | undefined;
}

// ============================================================================
// Cell Outputs (Jupyter standard)
// ============================================================================

export interface ExecuteResultOutput {
  output_type: "execute_result";
  data: MimeBundle;
  metadata: Record<string, unknown>;
  execution_count: number | null;
}

export interface DisplayDataOutput {
  output_type: "display_data";
  data: MimeBundle;
  metadata: Record<string, unknown>;
}

export interface StreamOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: MultilineString;
}

export interface ErrorOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}

export type CellOutput = ExecuteResultOutput | DisplayDataOutput | StreamOutput | ErrorOutput;

// ============================================================================
// DataSpren Extensions (stored in cell metadata)
// ============================================================================

/** DataSpren cell types — derived from source content (python default, sql when source starts with %sql) */
export type DataSprenCellType = "python" | "sql";

export type AssertTestType = "unique" | "not_null" | "accepted_values" | "custom_sql";


export interface AssertTest {
  id: string;
  type: AssertTestType;
  tableName: string;
  columnName: string;
  acceptedValues?: string[];
  customSQL?: string;
  enabled?: boolean;
}

export interface AssertResult {
  testId: string;
  passed: boolean;
  rowCount: number;
  rows?: unknown[][];
  columns?: string[];
  error?: string;
}


export type VisualizeChartType = "bar" | "line" | "scatter" | "pie" | "area";
export type AggregationType = "sum" | "count" | "avg" | "min" | "max";

export interface VisualizeConfig {
  chartType: VisualizeChartType;
  xColumn: string;
  yColumns: string[];
  aggregation?: AggregationType;
  groupBy?: string[];
}

export interface CellMetadata {
  viewName?: string;
  assertConfig?: { tests: AssertTest[] };
  visualizeConfig?: VisualizeConfig;
  enabled?: boolean;
  // Allow other metadata
  [key: string]: unknown;
}

// ============================================================================
// Notebook Cells (nbformat v4.5)
// ============================================================================

/** Code cell: executable with outputs */
export interface CodeCell {
  id: string;
  cell_type: "code";
  source: MultilineString;
  outputs: CellOutput[];
  execution_count: number | null;
  metadata: CellMetadata;
}

/** Raw cell: non-executable content */
export interface RawCell {
  id: string;
  cell_type: "raw";
  source: MultilineString;
  metadata: CellMetadata;
  attachments?: Record<string, MimeBundle>;
}

/** Markdown cell: documentation */
export interface MarkdownCell {
  id: string;
  cell_type: "markdown";
  source: MultilineString;
  metadata: CellMetadata;
  attachments?: Record<string, MimeBundle>;
}

export type NotebookCell = CodeCell | RawCell | MarkdownCell;

// ============================================================================
// Notebook Document (nbformat v4.5)
// ============================================================================

export interface NotebookMetadata {
  kernelspec?: {
    name: string;
    display_name: string;
  };
  language_info?: {
    name: string;
    codemirror_mode?: string | object;
    file_extension?: string;
    mimetype?: string;
    pygments_lexer?: string;
  };
  /** DataSpren-specific metadata */
  dataspren?: {
    name: string;
    created_at: number;
    updated_at: number;
    files?: string[];
  };
  // Allow other metadata
  [key: string]: unknown;
}

export interface NotebookDocument {
  nbformat: 4;
  nbformat_minor: number;
  metadata: NotebookMetadata;
  cells: NotebookCell[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isCodeCell(cell: NotebookCell): cell is CodeCell {
  return cell.cell_type === "code";
}

export function isMarkdownCell(cell: NotebookCell): cell is MarkdownCell {
  return cell.cell_type === "markdown";
}

export function isRawCell(cell: NotebookCell): cell is RawCell {
  return cell.cell_type === "raw";
}

// ============================================================================
// Cell Type Detection (derived from source content)
// ============================================================================

/** Determine cell type from source: "sql" if first line is %sql, otherwise "python" */
export function getCellType(source: MultilineString): DataSprenCellType {
  const str = getSourceString(source);
  return str.trimStart().startsWith("%sql") ? "sql" : "python";
}

/** Strip the %sql magic line from source, returning the executable content */
export function getExecutableSource(source: MultilineString): string {
  const str = getSourceString(source);
  if (str.trimStart().startsWith("%sql")) {
    return str.replace(/^\s*%sql[^\n]*\n?/, "");
  }
  return str;
}

// ============================================================================
// MultilineString Utilities
// ============================================================================

/** Convert MultilineString to a single string (for editing/execution) */
export function getSourceString(source: MultilineString): string {
  return Array.isArray(source) ? source.join("") : source;
}

/** Convert source to array format (for Jupyter-compatible serialization) */
export function getSourceArray(source: MultilineString): string[] {
  if (Array.isArray(source)) return source;
  return source.split(/(?<=\n)/); // Split but keep the newlines
}

/** Get string from optional MultilineString */
export function getMultilineString(value: MultilineString | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join("") : value;
}

// ============================================================================
// Output Factories
// ============================================================================

export function createExecuteResultOutput(
  data: MimeBundle,
  executionCount: number | null,
): ExecuteResultOutput {
  return {
    output_type: "execute_result",
    data,
    metadata: {},
    execution_count: executionCount,
  };
}

export function createDisplayDataOutput(data: MimeBundle): DisplayDataOutput {
  return {
    output_type: "display_data",
    data,
    metadata: {},
  };
}

export function createStreamOutput(name: "stdout" | "stderr", text: string): StreamOutput {
  return {
    output_type: "stream",
    name,
    text,
  };
}

export function createErrorOutput(ename: string, evalue: string, traceback: string[]): ErrorOutput {
  return {
    output_type: "error",
    ename,
    evalue,
    traceback,
  };
}

// ============================================================================
// Output Extraction
// ============================================================================

export function extractMimeData<T>(outputs: CellOutput[], mimeType: string): T | undefined {
  for (const output of outputs) {
    if (output.output_type === "execute_result" || output.output_type === "display_data") {
      const data = output.data[mimeType];
      if (data !== undefined) {
        return data as T;
      }
    }
  }
  return undefined;
}

export function extractImageData(outputs: CellOutput[]): string | undefined {
  const imageData = extractMimeData<MultilineString>(outputs, "image/png");
  if (typeof imageData === "string") {
    return imageData;
  }
  if (Array.isArray(imageData) && imageData.length > 0) {
    return imageData.join("");
  }
  return undefined;
}

export function extractAssertResults(outputs: CellOutput[]): AssertResult[] | undefined {
  return extractMimeData<AssertResult[]>(outputs, "application/vnd.dataspren.assert+json");
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a NotebookDocument to Jupyter-compatible JSON string.
 * Ensures all MultilineStrings are in array format.
 */
export function serializeNotebook(notebook: NotebookDocument): string {
  const exportDoc = {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      const base = {
        ...cell,
        source: getSourceArray(cell.source),
      };

      if (cell.cell_type !== "code") return base;

      return {
        ...base,
        outputs: cell.outputs.map((output) => {
          if (output.output_type === "stream") {
            return {
              ...output,
              text: getSourceArray(output.text),
            };
          }
          return output;
        }),
      };
    }),
  };

  return JSON.stringify(exportDoc, null, 1);
}

/**
 * Parse a Jupyter notebook from JSON string.
 */
export function parseNotebook(json: string): NotebookDocument {
  return JSON.parse(json) as NotebookDocument;
}

/**
 * Download a notebook as .ipynb file.
 */
export function downloadNotebook(notebook: NotebookDocument, filename: string): void {
  const content = serializeNotebook(notebook);
  const blob = new Blob([content], { type: "application/x-ipynb+json" });
  const url = URL.createObjectURL(blob);
  const a = globalThis.document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ipynb") ? filename : `${filename}.ipynb`;
  globalThis.document.body.appendChild(a);
  a.click();
  globalThis.document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create an empty notebook document.
 */
export function createEmptyNotebook(name: string): NotebookDocument {
  const now = Date.now();

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: "dataspren", display_name: "DataSpren" },
      language_info: { name: "python" },
      dataspren: { name, created_at: now, updated_at: now },
    },
    cells: [],
  };
}

/**
 * Create a new code cell.
 */
export function createCodeCell(
  source: string = "",
  datasprenType: DataSprenCellType = "python",
): CodeCell {
  const finalSource = datasprenType === "sql" && !source.trimStart().startsWith("%sql")
    ? (source ? `%sql\n${source}` : "%sql\n")
    : source;
  return {
    id: generateId(),
    cell_type: "code",
    source: finalSource,
    outputs: [],
    execution_count: null,
    metadata: {},
  };
}
