/**
 * Runtime types for the notebook module.
 *
 * This file contains types related to runtime execution and state.
 * For notebook document types (cells, outputs, etc.), see nbformat.ts.
 */

import type { AssertResult, CellOutput, DisplayDataOutput, ExecuteResultOutput } from "./nbformat";

// ============================================================================
// Runtime Types (from worker - to be moved to runtime interface later)
// ============================================================================

export interface TableColumn {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
}

export interface RegisteredFunction {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
}

export interface PythonVariable {
  name: string;
  type: string;
  value: string;
  size?: string;
}

// ============================================================================
// Execution Result
// ============================================================================

export type TableData = Record<string, unknown>[];

export interface ExecutionResult {
  output: string;
  error?: string;
  returnValue?: unknown;
  tableData?: TableData;
  totalRows?: number;
  imageData?: string;
}

// Keeping PyodideExecutionResult as alias for backward compatibility
export type PyodideExecutionResult = ExecutionResult;

// ============================================================================
// Runtime State (ephemeral, not persisted)
// ============================================================================

export interface CellRuntimeState {
  isRunning: boolean;
  isQueued: boolean;
}

export interface NotebookRuntimeState {
  selectedCellId: string | null;
  cellStates: Map<string, CellRuntimeState>;
  tables: TableInfo[];
  functions: RegisteredFunction[];
  variables: PythonVariable[];
  dataVersion: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function isTableData(data: unknown): data is TableData {
  return (
    Array.isArray(data) && (data.length === 0 || (typeof data[0] === "object" && data[0] !== null))
  );
}

export function extractTableData(outputs: CellOutput[]): TableData | undefined {
  for (const output of outputs) {
    if (output.output_type === "execute_result" || output.output_type === "display_data") {
      const jsonData = output.data["application/json"];
      if (isTableData(jsonData)) {
        return jsonData;
      }
    }
  }
  return undefined;
}

export function extractTotalRows(outputs: CellOutput[]): number | undefined {
  for (const output of outputs) {
    if (output.output_type === "execute_result" || output.output_type === "display_data") {
      const total = (output.metadata as Record<string, unknown>)?.totalRows;
      if (typeof total === "number") return total;
    }
  }
  return undefined;
}

export function getTableColumns(tableData: TableData): string[] {
  if (tableData.length === 0) return [];
  return Object.keys(tableData[0]);
}

export function createTableOutput(
  tableData: TableData,
  executionCount: number | null,
  totalRows?: number,
): ExecuteResultOutput {
  const columns = getTableColumns(tableData);
  return {
    output_type: "execute_result",
    data: {
      "application/json": tableData,
      "text/plain": [`Table with ${columns.length} columns, ${tableData.length} rows`],
    },
    metadata: totalRows !== undefined ? { totalRows } : {},
    execution_count: executionCount,
  };
}

export function createAssertOutput(results: AssertResult[]): DisplayDataOutput {
  return {
    output_type: "display_data",
    data: {
      "application/vnd.dataspren.assert+json": results,
      "text/plain": [
        `Assert results: ${results.filter((r) => r.passed).length}/${results.length} passed`,
      ],
    },
    metadata: {},
  };
}

export function createImageOutput(
  base64Data: string,
  executionCount: number | null,
): ExecuteResultOutput {
  return {
    output_type: "execute_result",
    data: {
      "image/png": base64Data,
      "text/plain": ["<Figure>"],
    },
    metadata: {},
    execution_count: executionCount,
  };
}
