"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataTable, type SortConfig } from "../components/data-table";
import { MAX_PREVIEW_ROWS } from "../constants";
import type { FileViewerProps, ViewerLoadingState } from "./types";

type ParquetLoadingState = ViewerLoadingState<{ data: Record<string, unknown>[]; totalRows: number }>;

export function ParquetFileViewer({ filePath, runtime }: FileViewerProps) {
  const [state, setState] = useState<ParquetLoadingState>({ status: "loading" });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", direction: null });
  const [totalRows, setTotalRows] = useState<number>(0);

  const loadData = useCallback(async (sort: SortConfig, isInitialLoad: boolean) => {
    try {
      // Only show loader on initial load, not on sort changes
      if (isInitialLoad) {
        setState({ status: "loading" });
      }

      // Get total row count (only on first load)
      if (totalRows === 0) {
        const countResult = await runtime.runSQL(`SELECT COUNT(*) as count FROM read_parquet('${filePath}')`);
        const count = countResult.tableData?.[0]?.count as number ?? 0;
        setTotalRows(count);
      }

      // Build SQL with optional ORDER BY
      let sql = `SELECT * FROM read_parquet('${filePath}')`;
      if (sort.column && sort.direction) {
        sql += ` ORDER BY "${sort.column}" ${sort.direction.toUpperCase()}`;
      }
      sql += ` LIMIT ${MAX_PREVIEW_ROWS}`;

      const result = await runtime.runSQL(sql);

      if (result.error) {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "success", data: result.tableData ?? [], totalRows: totalRows || (result.tableData?.length ?? 0) });
    } catch (e) {
      console.error("Failed to load Parquet:", e);
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to load Parquet file",
      });
    }
  }, [filePath, runtime, totalRows]);

  const isInitialLoadRef = useRef(true);
  
  useEffect(() => {
    loadData(sortConfig, isInitialLoadRef.current);
    isInitialLoadRef.current = false;
  }, [sortConfig, loadData]);
  
  // Reset initial load flag when file changes
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [filePath]);

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full text-neutral-500">
        <div className="text-center">
          <p className="font-medium">Failed to load Parquet file</p>
          <p className="text-sm mt-1 text-neutral-400">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background p-4 overflow-hidden flex flex-col">
      <DataTable 
        data={state.data} 
        fillHeight 
        totalRows={totalRows || state.totalRows} 
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
