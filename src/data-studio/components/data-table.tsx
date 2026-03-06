"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DataTable as CarbonDataTableIcon } from "@carbon/icons-react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CellContentPopover } from "./cell-content-popover";
import { ROW_HEIGHT, DEFAULT_VISIBLE_ROWS } from "../constants";

export type SortDirection = "asc" | "desc" | null;
export interface SortConfig {
  column: string;
  direction: SortDirection;
}

interface DataTableProps {
  data: Record<string, unknown>[];
  /** If true, the table will fill available height instead of using a fixed max height */
  fillHeight?: boolean;
  /** If true, shows a loading indicator in the footer */
  isLoadingMore?: boolean;
  /** Total number of rows (if different from data.length, e.g., when limited) */
  totalRows?: number;
  /** External sort state (for server-side sorting) */
  sortConfig?: SortConfig;
  /** Callback when sort changes (for server-side sorting). If provided, disables local sorting. */
  onSortChange?: (config: SortConfig) => void;
}

export function DataTable({ data, fillHeight = false, isLoadingMore = false, totalRows, sortConfig, onSortChange }: DataTableProps) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Use external sort if provided, otherwise use local
  const isServerSide = !!onSortChange;
  const sorting: SortingState = isServerSide && sortConfig?.column
    ? [{ id: sortConfig.column, desc: sortConfig.direction === "desc" }]
    : localSorting;

  const columnNames = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const measureColumns = useCallback(() => {
    if (!headerRef.current) return;
    const cells = headerRef.current.children;
    const widths: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      widths.push(cells[i].getBoundingClientRect().width);
    }
    setColWidths(widths);
  }, []);

  useLayoutEffect(() => {
    measureColumns();
  }, [columnNames, measureColumns]);

  const handleHeaderClick = (col: string, currentDirection: "asc" | "desc" | false) => {
    if (isServerSide && onSortChange) {
      // Cycle: none -> asc -> desc -> none
      let newDirection: SortDirection;
      if (sortConfig?.column !== col) {
        newDirection = "asc";
      } else if (currentDirection === "asc") {
        newDirection = "desc";
      } else if (currentDirection === "desc") {
        newDirection = null;
      } else {
        newDirection = "asc";
      }
      onSortChange({ column: col, direction: newDirection });
    }
  };

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      columnNames.map((col) => ({
        id: col,
        accessorFn: (row) => row[col],
        header: ({ column }) => (
          <div className="flex items-center gap-1 group/header">
            <span className="select-text cursor-text" onClick={(e) => e.stopPropagation()}>{col}</span>
            <button
              onClick={() => {
                if (isServerSide) {
                  handleHeaderClick(col, column.getIsSorted());
                } else {
                  column.toggleSorting();
                }
              }}
              className="shrink-0 hover:text-neutral-950 dark:hover:text-neutral-100 transition-colors"
            >
              {column.getIsSorted() === "asc" ? (
                <ArrowUp size={10} className="text-neutral-950 dark:text-neutral-100" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown size={10} className="text-neutral-950 dark:text-neutral-100" />
              ) : (
                <ArrowUpDown
                  size={10}
                  className="opacity-0 group-hover/header:opacity-100 transition-opacity text-neutral-400 dark:text-neutral-500"
                />
              )}
            </button>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          const displayContent =
            value === null || value === undefined || value === "" ? (
              <span className="text-neutral-400 dark:text-neutral-500 italic">
                {value === null ? "null" : value === undefined ? "undefined" : "empty"}
              </span>
            ) : (
              String(value)
            );
          return (
            <CellContentPopover value={value}>
              <div className="max-w-[300px] truncate">{displayContent}</div>
            </CellContentPopover>
          );
        },
      })),
    [columnNames, isServerSide, sortConfig, onSortChange]
  );

  const handleSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    if (!isServerSide) {
      setLocalSorting(updater);
    }
  };

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isServerSide ? undefined : getSortedRowModel(),
    manualSorting: isServerSide,
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const headerGridCols = `repeat(${columnNames.length}, minmax(120px, auto))`;
  const rowGridCols = colWidths ? colWidths.map(w => `${w}px`).join(" ") : headerGridCols;
  const needsScroll = data.length > DEFAULT_VISIBLE_ROWS;
  const maxHeight = fillHeight ? undefined : (needsScroll ? ROW_HEIGHT * DEFAULT_VISIBLE_ROWS + 36 : undefined);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-card rounded-lg border border-neutral-200 dark:border-border overflow-hidden">
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <span className="mx-auto text-neutral-300 dark:text-neutral-600 mb-2 block w-fit"><CarbonDataTableIcon size={32} /></span>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No data in this file</p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={tableContainerRef}
            className="overflow-auto flex-1 text-[13px]"
            style={{ maxHeight }}
          >
            {/* Header row - sticky */}
            <div
              ref={headerRef}
              className="grid sticky top-0 z-10 bg-neutral-50 dark:bg-muted border-b border-neutral-200 dark:border-border"
              style={{
                gridTemplateColumns: headerGridCols,
                width: "max-content",
                minWidth: "100%",
              }}
            >
              {table.getHeaderGroups().map((headerGroup) =>
                headerGroup.headers.map((header) => (
                  <div
                    key={header.id}
                    className="px-3 py-2.5 text-left font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                ))
              )}
            </div>

            {/* Virtualized body */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    className="grid border-b border-neutral-100 dark:border-border/30 hover:bg-neutral-50/80 dark:hover:bg-accent/30 transition-colors bg-white dark:bg-card"
                    style={{
                      gridTemplateColumns: rowGridCols,
                      height: ROW_HEIGHT,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className="px-3 py-1.5 text-neutral-700 dark:text-neutral-200 truncate"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500 border-t border-neutral-200/50 dark:border-border/50 bg-neutral-50/50 dark:bg-muted/20">
            <span>
              {totalRows && totalRows > data.length ? (
                <>Showing {data.length.toLocaleString()} of {totalRows.toLocaleString()} rows</>
              ) : (
                <>{data.length.toLocaleString()} row{data.length !== 1 ? "s" : ""}</>
              )}
              {" · "}{columnNames.length} column{columnNames.length !== 1 ? "s" : ""}
            </span>
            {isLoadingMore && (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Loading more...
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
