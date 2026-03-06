"use client";

import { Loader2 } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useEffect, useRef, useState } from "react";
import { readOPFSFile } from "../runtime/opfs-list";
import { DataTable, type SortConfig } from "../components/data-table";
import { MAX_PREVIEW_ROWS, NEWLINE_BYTE, OPFS_PREFIX } from "../constants";
import type { FileViewerProps, ViewerLoadingState } from "./types";

/**
 * Scan raw bytes for newlines.
 * Returns { totalRows, previewEnd } where previewEnd is the byte offset
 * just past the (MAX_PREVIEW_ROWS+1)th newline (header + MAX_PREVIEW_ROWS data rows),
 * so we only need to decode that prefix for PapaParse.
 */
function scanBytes(bytes: Uint8Array, previewRows: number): { totalRows: number; previewEnd: number } {
  let newlines = 0;
  let previewEnd = -1;
  // We need header + previewRows data rows = previewRows + 1 newlines
  const previewTarget = previewRows + 1;

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === NEWLINE_BYTE) {
      newlines++;
      if (newlines === previewTarget && previewEnd === -1) {
        previewEnd = i + 1;
      }
    }
  }

  const hasTrailingNewline = bytes.length > 0 && bytes[bytes.length - 1] === NEWLINE_BYTE;
  const totalRows = hasTrailingNewline ? newlines - 1 : newlines;

  // If file has fewer rows than preview, decode everything
  if (previewEnd === -1) previewEnd = bytes.length;

  return { totalRows, previewEnd };
}

type CsvLoadingState = ViewerLoadingState<{ data: Record<string, unknown>[]; totalRows: number }>;

export function CsvFileViewer({ filePath }: FileViewerProps) {
  const [state, setState] = useState<CsvLoadingState>({ status: "loading" });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", direction: null });
  const currentFileRef = useRef(filePath);

  const loadData = useCallback(async () => {
    setState({ status: "loading" });
    currentFileRef.current = filePath;

    try {
      const t0 = performance.now();

      // Read directly from OPFS — no worker/runtime dependency
      const opfsPath = filePath.startsWith(OPFS_PREFIX) ? filePath.slice(OPFS_PREFIX.length) : filePath;
      const bytes = await readOPFSFile(opfsPath);
      const t1 = performance.now();
      console.log(`[CsvViewer] readOPFS: ${(t1 - t0).toFixed(1)}ms (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);

      if (currentFileRef.current !== filePath) return;

      const { totalRows, previewEnd } = scanBytes(bytes, MAX_PREVIEW_ROWS);
      const t2 = performance.now();
      console.log(`[CsvViewer] scanBytes: ${(t2 - t1).toFixed(1)}ms (${totalRows} rows, decoding first ${(previewEnd / 1024).toFixed(1)} KB)`);

      // Only decode the prefix needed for the preview rows
      const text = new TextDecoder().decode(bytes.subarray(0, previewEnd));
      const t3 = performance.now();
      console.log(`[CsvViewer] TextDecoder (prefix): ${(t3 - t2).toFixed(1)}ms`);

      let emptyColIndex = 0;
      const result = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        preview: MAX_PREVIEW_ROWS,
        transformHeader: (header) => header === "" ? `_unnamed_${emptyColIndex++}` : header,
      });
      const t4 = performance.now();
      console.log(`[CsvViewer] PapaParse: ${(t4 - t3).toFixed(1)}ms (${result.data.length} rows, ${result.meta.fields?.length ?? 0} cols)`);
      console.log(`[CsvViewer] total: ${(t4 - t0).toFixed(1)}ms`);

      if (result.errors.length > 0 && result.data.length === 0) {
        setState({ status: "error", message: result.errors[0].message });
        return;
      }

      setState({
        status: "success",
        data: result.data,
        totalRows,
      });
    } catch (e) {
      console.error("Failed to load CSV:", e);
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to load CSV file",
      });
    }
  }, [filePath]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <p className="font-medium">Failed to load CSV file</p>
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
        totalRows={state.totalRows}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
      />
    </div>
  );
}

