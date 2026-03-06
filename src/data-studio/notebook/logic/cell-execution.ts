import {
  createAssertOutput,
  createImageOutput,
  createTableOutput,
  extractTableData,
  getCellType,
  getExecutableSource,
  getSourceString,
  isCodeCell,
  type AssertResult,
  type AssertTest,
  type CellOutput,
  type ErrorOutput,
  type NotebookCell,
  type StreamOutput,
  type TableData,
  type VisualizeConfig,
} from "../../runtime";
import type { RuntimeContextValue } from "../../provider/runtime-provider";
import {
  buildVizQuery,
  computeEffectiveVizConfig,
  computeNeedsAggregation,
} from "../results/viz-utils";

function generateTestSQL(test: AssertTest): string {
  const escapeCol = (col: string) => `"${col.replace(/"/g, '""')}"`;

  switch (test.type) {
    case "unique":
      return `SELECT ${escapeCol(test.columnName)}, COUNT(*) as _count FROM ${test.tableName} GROUP BY ${escapeCol(test.columnName)} HAVING COUNT(*) > 1 LIMIT 10`;
    case "not_null":
      return `SELECT * FROM ${test.tableName} WHERE ${escapeCol(test.columnName)} IS NULL LIMIT 10`;
    case "accepted_values": {
      const values = (test.acceptedValues || [])
        .map((v) => `'${v.replace(/'/g, "''")}'`)
        .join(", ");
      return `SELECT * FROM ${test.tableName} WHERE ${escapeCol(test.columnName)} NOT IN (${values}) AND ${escapeCol(test.columnName)} IS NOT NULL LIMIT 10`;
    }
    case "custom_sql":
      return test.customSQL || "SELECT 1 WHERE FALSE";
    default:
      return "SELECT 1 WHERE FALSE";
  }
}

// ============================================================================
// Assert Test Execution
// ============================================================================

export async function executeAssertTests(
  runtime: RuntimeContextValue,
  tests: AssertTest[],
): Promise<AssertResult[]> {
  const results: AssertResult[] = [];
  for (const test of tests) {
    if (test.enabled === false) continue;
    const testSQL = generateTestSQL(test);
    try {
      const result = await runtime.runSQL(testSQL);
      const tableData = result.tableData;
      const rowCount = tableData?.length || 0;
      const columns =
        tableData && tableData.length > 0 ? Object.keys(tableData[0]) : [];
      const rows = tableData?.map((row: Record<string, unknown>) => columns.map((col) => row[col]));
      results.push({
        testId: test.id,
        passed: rowCount === 0,
        rowCount,
        rows,
        columns,
        error: result.error,
      });
    } catch (err) {
      results.push({
        testId: test.id,
        passed: false,
        rowCount: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
  return results;
}

// ============================================================================
// Cell Execution
// ============================================================================

export interface ExecuteCellResult {
  outputs: CellOutput[];
  shouldRefreshViz: boolean;
}

export async function executeCell(
  cell: NotebookCell,
  runtime: RuntimeContextValue,
  execCount: number,
  queryOverride?: string,
): Promise<ExecuteCellResult> {
  const outputs: CellOutput[] = [];
  const cellType = getCellType(cell.source);
  let shouldRefreshViz = false;

  try {
    if (cellType === "python") {
      const result = await runtime.runPython(getSourceString(cell.source));
      if (result.error) {
        outputs.push({
          output_type: "error",
          ename: "ExecutionError",
          evalue: result.error,
          traceback: [result.error],
        } as ErrorOutput);
      } else {
        if (result.output)
          outputs.push({
            output_type: "stream",
            name: "stdout",
            text: result.output,
          } as StreamOutput);
        if (result.tableData)
          outputs.push(
            createTableOutput(result.tableData, execCount, result.totalRows),
          );
        if (result.imageData)
          outputs.push(createImageOutput(result.imageData, execCount));
      }
      runtime.refreshFunctions();
      runtime.refreshVariables();
    } else if (cellType === "sql") {
      const queryToRun =
        queryOverride || getExecutableSource(cell.source);
      const result = await runtime.runSQL(
        queryToRun,
        queryOverride ? undefined : cell.metadata.viewName,
      );
      if (result.error) {
        outputs.push({
          output_type: "error",
          ename: "SQLError",
          evalue: result.error,
          traceback: [result.error],
        } as ErrorOutput);
      } else {
        if (result.output)
          outputs.push({
            output_type: "stream",
            name: "stdout",
            text: result.output,
          } as StreamOutput);
        if (result.tableData)
          outputs.push(
            createTableOutput(result.tableData, execCount, result.totalRows),
          );
      }
      runtime.refreshTables();
      runtime.refreshVariables();

      const embeddedTests = cell.metadata.assertConfig?.tests;
      if (embeddedTests && embeddedTests.length > 0) {
        const assertResults = await executeAssertTests(runtime, embeddedTests);
        outputs.push(createAssertOutput(assertResults));
      }

      if (cell.metadata.visualizeConfig) {
        shouldRefreshViz = true;
      }
    }
  } catch (err) {
    outputs.push({
      output_type: "error",
      ename: "ExecutionError",
      evalue: err instanceof Error ? err.message : String(err),
      traceback: [err instanceof Error ? err.message : String(err)],
    } as ErrorOutput);
  }

  return { outputs, shouldRefreshViz };
}

// ============================================================================
// Viz Data Fetching
// ============================================================================

export async function fetchVizData(
  cell: NotebookCell,
  runtime: RuntimeContextValue,
  configOverride?: VisualizeConfig,
): Promise<TableData | null> {
  if (!isCodeCell(cell)) return null;

  const viewName = cell.metadata.viewName;
  if (!viewName) return null;

  const tableData = extractTableData(cell.outputs) ?? null;
  if (!tableData || tableData.length === 0) return null;

  const vizConfig =
    configOverride ??
    (cell.metadata.visualizeConfig as VisualizeConfig | undefined);
  const effectiveConfig = computeEffectiveVizConfig(tableData, vizConfig);
  if (!effectiveConfig) return null;

  const needsAggregation = computeNeedsAggregation(tableData, effectiveConfig);
  const query = buildVizQuery(viewName, effectiveConfig, needsAggregation);

  try {
    const result = await runtime.runSQL(query);
    return result.tableData && result.tableData.length > 0
      ? result.tableData
      : null;
  } catch {
    return null;
  }
}
