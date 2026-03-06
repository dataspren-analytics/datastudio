"use client";

import { useMemo } from "react";
import {
  extractImageData,
  extractTableData,
  extractTotalRows,
  getMultilineString,
  type CodeCell as CodeCellType,
  type ErrorOutput,
  type StreamOutput,
} from "../../runtime";
import { ResultTable } from "./result-table";
import { CellExecutionIndicator } from "./cell-execution-indicator";

export interface CellOutputProps {
  cell: CodeCellType;
  isQueued: boolean;
  isRunning: boolean;
  visibleRows?: number;
  onChangeVisibleRows?: (rows: number) => void;
}

export function CellOutput({ cell, isQueued, isRunning, visibleRows, onChangeVisibleRows }: CellOutputProps) {
  const { errorOutput, streamOutput, tableData, totalRows, imageData } = useMemo(() => {
    let error: ErrorOutput | undefined;
    let stream: StreamOutput | undefined;

    for (const output of cell.outputs) {
      if (output.output_type === "error") {
        error = output;
      } else if (output.output_type === "stream") {
        stream = output;
      }
    }

    return {
      errorOutput: error,
      streamOutput: stream,
      tableData: extractTableData(cell.outputs),
      totalRows: extractTotalRows(cell.outputs),
      imageData: extractImageData(cell.outputs),
    };
  }, [cell.outputs]);

  if (isQueued || isRunning) {
    return null;
  }

  if (errorOutput) {
    return (
      <pre className="text-sm font-mono text-red-500 dark:text-red-400 whitespace-pre px-3 py-2 overflow-x-auto w-0 min-w-full">
        {errorOutput.evalue}
      </pre>
    );
  }

  return (
    <>
      {streamOutput && (
        <pre className="text-sm whitespace-pre px-3 py-2 overflow-x-auto w-0 min-w-full text-neutral-800 dark:text-neutral-200">
          {getMultilineString(streamOutput.text)}
        </pre>
      )}
      {tableData && (
        <ResultTable
          tableData={tableData}
          totalRows={totalRows}
          viewName={cell.metadata.viewName}
          cellId={cell.id}
          visibleRows={visibleRows}
          onChangeVisibleRows={onChangeVisibleRows}
        />
      )}
      {imageData && (
        <div className="p-3 flex justify-center">
          <img
            src={`data:image/png;base64,${imageData}`}
            alt="Output figure"
            className="max-w-full h-auto"
          />
        </div>
      )}
    </>
  );
}
