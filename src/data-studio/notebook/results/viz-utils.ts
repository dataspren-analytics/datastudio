import type { TableData, VisualizeConfig } from "../../runtime";
import { VIZ_MAX_ROWS } from "../../constants";

/**
 * Check if the X column has non-unique values, meaning aggregation is needed.
 */
export function hasNonUniqueX(tableData: TableData, xColumn: string): boolean {
  const seen = new Set<string>();
  for (const row of tableData) {
    const key = String(row[xColumn] ?? "");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Build a DuckDB query to fetch visualization data.
 */
export function buildVizQuery(
  viewName: string,
  config: VisualizeConfig,
  needsAggregation: boolean,
): string {
  const { xColumn, yColumns, aggregation } = config;
  const quote = (col: string) => `"${col}"`;

  if (needsAggregation) {
    const agg = aggregation || "sum";
    const sqlAgg = agg === "avg" ? "AVG" : agg.toUpperCase();
    const yAggs = yColumns.map(col => `${sqlAgg}(${quote(col)}) as ${quote(col)}`).join(", ");
    return `SELECT ${quote(xColumn)}, ${yAggs} FROM ${quote(viewName)} GROUP BY ${quote(xColumn)} ORDER BY ${quote(xColumn)} LIMIT ${VIZ_MAX_ROWS}`;
  }

  const cols = [xColumn, ...yColumns].map(quote).join(", ");
  return `SELECT ${cols} FROM ${quote(viewName)} ORDER BY ${quote(xColumn)} LIMIT ${VIZ_MAX_ROWS}`;
}

/**
 * Compute effective viz config by applying defaults from the tableData columns.
 */
export function computeEffectiveVizConfig(
  tableData: TableData | null,
  vizConfig?: VisualizeConfig,
): VisualizeConfig | null {
  if (!tableData || tableData.length === 0) return null;

  const tableColumns = Object.keys(tableData[0]);
  if (tableColumns.length === 0) return null;

  const numericColumns = new Set<string>();
  const sample = tableData[0];
  for (const key of Object.keys(sample)) {
    if (typeof sample[key] === "number" || typeof sample[key] === "bigint") {
      numericColumns.add(key);
    }
  }

  const firstNumericCol = tableColumns.find((c) => numericColumns.has(c));

  return {
    chartType: vizConfig?.chartType || "bar",
    xColumn: vizConfig?.xColumn || tableColumns[0],
    yColumns: vizConfig?.yColumns?.length
      ? vizConfig.yColumns
      : firstNumericCol ? [firstNumericCol] : [tableColumns[0]],
    aggregation: vizConfig?.aggregation,
    groupBy: vizConfig?.groupBy
      ? Array.isArray(vizConfig.groupBy) ? vizConfig.groupBy : [vizConfig.groupBy as unknown as string]
      : undefined,
  };
}

/**
 * Determine if aggregation is needed for the given config and data.
 */
export function computeNeedsAggregation(
  tableData: TableData | null,
  effectiveVizConfig: VisualizeConfig | null,
): boolean {
  if (!tableData || !effectiveVizConfig) return false;
  if (effectiveVizConfig.chartType === "scatter") return false;
  return hasNonUniqueX(tableData, effectiveVizConfig.xColumn);
}
