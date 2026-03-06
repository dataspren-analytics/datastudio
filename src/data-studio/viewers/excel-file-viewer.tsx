"use client";

import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileSpreadsheet, Loader2, PanelRight, Sparkles, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { ExecutionResult } from "../runtime";
import { EXCEL_ROW_HEIGHT, EXCEL_COL_WIDTH, EXCEL_ROW_HEADER_WIDTH, EXCEL_AUTO_SAVE_DEBOUNCE_MS } from "../constants";
import { getFileName, getParentDir } from "./hooks/file-path-utils";
import type { FileViewerProps } from "./types";

interface CellPosition {
  row: number;
  col: number;
}

interface Selection {
  start: CellPosition;
  end: CellPosition;
}

function isInSelection(row: number, col: number, selection: Selection | null): boolean {
  if (!selection) return false;
  const minRow = Math.min(selection.start.row, selection.end.row);
  const maxRow = Math.max(selection.start.row, selection.end.row);
  const minCol = Math.min(selection.start.col, selection.end.col);
  const maxCol = Math.max(selection.start.col, selection.end.col);
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

function isActiveCell(row: number, col: number, selection: Selection | null): boolean {
  if (!selection) return false;
  return row === selection.start.row && col === selection.start.col;
}

function getSelectionBounds(selection: Selection) {
  return {
    minRow: Math.min(selection.start.row, selection.end.row),
    maxRow: Math.max(selection.start.row, selection.end.row),
    minCol: Math.min(selection.start.col, selection.end.col),
    maxCol: Math.max(selection.start.col, selection.end.col),
  };
}

function hasMultipleCells(selection: Selection | null): boolean {
  if (!selection) return false;
  return selection.start.row !== selection.end.row || selection.start.col !== selection.end.col;
}

interface CellData {
  value: unknown;
  formatted?: string;
}

type SheetGrid = CellData[][];

function columnLabel(index: number): string {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function parseWorksheet(worksheet: XLSX.WorkSheet): { grid: SheetGrid; colCount: number; rowCount: number } {
  const range = worksheet["!ref"];
  if (!range) return { grid: [], colCount: 0, rowCount: 0 };

  const decoded = XLSX.utils.decode_range(range);
  const rowCount = decoded.e.r - decoded.s.r + 1;
  const colCount = decoded.e.c - decoded.s.c + 1;

  const grid: SheetGrid = [];

  for (let r = decoded.s.r; r <= decoded.e.r; r++) {
    const row: CellData[] = [];
    for (let c = decoded.s.c; c <= decoded.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellAddress];
      if (cell) {
        row.push({
          value: cell.v,
          formatted: cell.w,
        });
      } else {
        row.push({ value: null });
      }
    }
    grid.push(row);
  }

  return { grid, colCount, rowCount };
}

type CellEditsMap = Map<string, string>;

interface GridCellProps {
  row: number;
  col: number;
  top: number;
  left: number;
  width: number;
  height: number;
  value: string;
  isSelected: boolean;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onMouseEnter: (row: number, col: number) => void;
  onDoubleClick: (row: number, col: number, value: string) => void;
  onEditChange: (value: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditBlur: () => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

const GridCell = memo(function GridCell({
  row,
  col,
  top,
  left,
  width,
  height,
  value,
  isSelected,
  isActive,
  isEditing,
  editValue,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  editInputRef,
}: GridCellProps) {
  const isEmpty = value === "";

  return (
    <div
      className={cn(
        "absolute border-b border-r px-2 flex items-center text-xs font-mono overflow-hidden cursor-cell",
        isEditing
          ? "border-2 border-blue-500 dark:border-blue-400 z-20 bg-white dark:bg-card"
          : isActive
            ? "border-2 border-blue-500 dark:border-blue-400 z-10"
            : isSelected
              ? "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800"
              : "border-neutral-200/60 dark:border-border/60",
        !isEditing && !isSelected && !isActive && (
          row % 2 === 0
            ? "bg-white dark:bg-card"
            : "bg-neutral-50/50 dark:bg-muted/30"
        )
      )}
      style={{ top, left, width, height }}
      onMouseDown={(e) => onMouseDown(row, col, e)}
      onMouseEnter={() => onMouseEnter(row, col)}
      onDoubleClick={() => onDoubleClick(row, col, value)}
    >
      {isEditing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={onEditKeyDown}
          onBlur={onEditBlur}
          className="w-full h-full bg-transparent outline-none text-neutral-900 dark:text-neutral-100"
        />
      ) : isEmpty ? (
        <span className="text-neutral-300 dark:text-neutral-600" />
      ) : (
        <span className="truncate text-neutral-900 dark:text-neutral-100">
          {value}
        </span>
      )}
    </div>
  );
});

interface ExcelRuntimeActions {
  readFile: (path: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
  runSQL: (sql: string) => Promise<ExecutionResult>;
}

interface SelectedCellData {
  row: number;
  col: number;
  value: string;
}

interface ExcelFileViewerInnerProps {
  filePath: string;
  runtimeActions: ExcelRuntimeActions;
  showTableView: boolean;
  onToggleTableView: () => void;
  onSelectionChange: (cells: SelectedCellData[]) => void;
}

const ExcelFileViewerInner = memo(function ExcelFileViewerInner({
  filePath,
  runtimeActions,
  showTableView,
  onToggleTableView,
  onSelectionChange,
}: ExcelFileViewerInnerProps) {
  // Simple state: workbook data + per-sheet edits overlay
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editValue, setEditValue] = useState("");
  // Per-sheet edits: sheetName -> (cellKey -> value)
  const [sheetEdits, setSheetEdits] = useState<Map<string, CellEditsMap>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [previewEdits, setPreviewEdits] = useState<Map<string, string> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);

  const getCellKey = (row: number, col: number) => `${row},${col}`;

  const currentSheetName = workbook?.SheetNames[activeSheetIndex] ?? "";
  const currentEdits = sheetEdits.get(currentSheetName) ?? new Map<string, string>();

  // Get cell value: check preview first, then edits, then original
  const getCellValue = useCallback((row: number, col: number, grid: SheetGrid): string => {
    const key = getCellKey(row, col);
    // Check preview edits first (for SQL preview)
    if (previewEdits) {
      const previewed = previewEdits.get(key);
      if (previewed !== undefined) return previewed;
    }
    const edited = currentEdits.get(key);
    if (edited !== undefined) return edited;
    const cell = grid[row]?.[col];
    if (cell?.formatted) return cell.formatted;
    if (cell?.value !== null && cell?.value !== undefined) return String(cell.value);
    return "";
  }, [currentEdits, previewEdits]);

  // Set cell edit
  const setCellEdit = useCallback((row: number, col: number, value: string) => {
    const key = getCellKey(row, col);
    setSheetEdits(prev => {
      const newMap = new Map(prev);
      const edits = new Map(newMap.get(currentSheetName) ?? []);
      edits.set(key, value);
      newMap.set(currentSheetName, edits);
      return newMap;
    });
  }, [currentSheetName]);

  const startEditing = useCallback((row: number, col: number, currentValue: string) => {
    setEditingCell({ row, col });
    setEditValue(currentValue);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    setCellEdit(editingCell.row, editingCell.col, editValue);
    setEditingCell(null);
  }, [editingCell, editValue, setCellEdit]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (editingCell) commitEdit();
    if (e.shiftKey && selection) {
      setSelection({ start: selection.start, end: { row, col } });
    } else {
      setSelection({ start: { row, col }, end: { row, col } });
    }
    setIsSelecting(true);
  }, [selection, editingCell, commitEdit]);

  const handleCellDoubleClick = useCallback((row: number, col: number, currentValue: string) => {
    startEditing(row, col, currentValue);
  }, [startEditing]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      if (selection) {
        const newCol = e.shiftKey ? selection.start.col - 1 : selection.start.col + 1;
        if (newCol >= 0) {
          setSelection({ start: { row: selection.start.row, col: newCol }, end: { row: selection.start.row, col: newCol } });
        }
      }
    }
  }, [commitEdit, cancelEdit, selection]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (isSelecting && selection) {
      setSelection({ start: selection.start, end: { row, col } });
    }
  }, [isSelecting, selection]);

  const handleOpenSqlInput = useCallback(() => {
    setShowSqlInput(true);
    setSqlQuery("select\n\trow,\n\tcol,\n\tvalue as value\nfrom cells");
    setSqlError(null);
    setTimeout(() => sqlInputRef.current?.focus(), 0);
  }, []);

  const handleCloseSqlInput = useCallback(() => {
    setShowSqlInput(false);
    setSqlQuery("");
    setSqlError(null);
    setPreviewEdits(null);
  }, []);

  const sheetData = useMemo(() => {
    if (!workbook) return { grid: [] as SheetGrid, colCount: 0, rowCount: 0 };
    const worksheet = workbook.Sheets[currentSheetName];
    if (!worksheet) return { grid: [] as SheetGrid, colCount: 0, rowCount: 0 };
    return parseWorksheet(worksheet);
  }, [workbook, currentSheetName]);

  const buildCteFromSelection = useCallback(() => {
    if (!selection) return null;
    const bounds = getSelectionBounds(selection);
    
    // First pass: check if types are mixed (has both numbers and strings)
    let hasNumber = false;
    let hasString = false;
    const rawValues: Array<{ r: number; c: number; raw: string }> = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const raw = getCellValue(r, c, sheetData.grid);
        rawValues.push({ r, c, raw });
        if (raw !== "" && !isNaN(Number(raw))) {
          hasNumber = true;
        } else if (raw !== "") {
          hasString = true;
        }
      }
    }
    const forceStrings = hasNumber && hasString;

    // Second pass: build VALUES, casting numbers to strings only when mixed
    const values: string[] = [];
    for (const { r, c, raw } of rawValues) {
      let sqlValue: string;
      if (raw === "") {
        sqlValue = "NULL";
      } else if (!forceStrings && !isNaN(Number(raw))) {
        sqlValue = String(Number(raw));
      } else {
        sqlValue = `'${raw.replace(/'/g, "''")}'`;
      }
      values.push(`(${r}, ${c}, ${sqlValue})`);
    }

    return `WITH cells(row, col, value) AS (\n  VALUES\n    ${values.join(",\n    ")}\n)\n`;
  }, [selection, sheetData.grid, getCellValue]);

  const handlePreviewSql = useCallback(async () => {
    if (!selection || !sqlQuery.trim()) return;

    const cte = buildCteFromSelection();
    if (!cte) return;

    setIsExecutingSql(true);
    setSqlError(null);

    try {
      const fullQuery = cte + sqlQuery;
      const result = await runtimeActions.runSQL(fullQuery);

      if (result.error) {
        setSqlError(result.error);
        setIsExecutingSql(false);
        return;
      }

      const tableData = result.tableData ?? [];
      const bounds = getSelectionBounds(selection);

      // Build preview edits map
      const preview = new Map<string, string>();
      const resultMap = new Map<string, unknown>();
      for (const row of tableData) {
        const r = row.row as number;
        const c = row.col as number;
        const v = row.value;
        resultMap.set(getCellKey(r, c), v);
      }

      for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
        for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
          const key = getCellKey(r, c);
          if (resultMap.has(key)) {
            const value = resultMap.get(key);
            preview.set(key, value === null || value === undefined ? "" : String(value));
          } else {
            preview.set(key, "");
          }
        }
      }

      setPreviewEdits(preview);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : "Failed to execute SQL");
    } finally {
      setIsExecutingSql(false);
    }
  }, [selection, sqlQuery, buildCteFromSelection, runtimeActions]);

  const handleAcceptPreview = useCallback(() => {
    if (!previewEdits) return;

    // Apply preview edits to actual edits
    setSheetEdits(prev => {
      const newMap = new Map(prev);
      const edits = new Map(newMap.get(currentSheetName) ?? []);
      
      for (const [key, value] of previewEdits) {
        edits.set(key, value);
      }
      
      newMap.set(currentSheetName, edits);
      return newMap;
    });

    handleCloseSqlInput();
  }, [previewEdits, currentSheetName, handleCloseSqlInput]);

  const handleRevertPreview = useCallback(() => {
    setPreviewEdits(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  useEffect(() => {
    if (isSelecting) {
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isSelecting, handleMouseUp]);

  // Load file on mount or when filePath changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSheetEdits(new Map()); // Clear edits when loading new file

    runtimeActions.readFile(filePath).then(data => {
      if (cancelled) return;
      const wb = XLSX.read(data, { type: "array" });
      setWorkbook(wb);
      setLoading(false);
    }).catch(e => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load Excel file");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filePath, runtimeActions]);

  // Reset sheet index when file changes
  useEffect(() => {
    setActiveSheetIndex(0);
    setSelection(null);
  }, [filePath]);

  // Reset selection when sheet changes
  useEffect(() => {
    setSelection(null);
  }, [activeSheetIndex]);

  // Report selection changes to parent for table view sidebar
  useEffect(() => {
    if (!selection || !showTableView) {
      onSelectionChange([]);
      return;
    }

    const bounds = getSelectionBounds(selection);
    const cells: SelectedCellData[] = [];
    
    // Sort by column first, then by row within each column
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
        cells.push({
          row: r,
          col: c,
          value: getCellValue(r, c, sheetData.grid),
        });
      }
    }
    
    onSelectionChange(cells);
  }, [selection, showTableView, sheetData.grid, getCellValue, onSelectionChange]);

  // Check if there are unsaved edits
  const hasEdits = sheetEdits.size > 0 && Array.from(sheetEdits.values()).some(m => m.size > 0);

  // Save: apply edits to a copy of workbook, write to file, reload
  const handleSave = useCallback(async () => {
    if (!workbook || !hasEdits) return;
    
    setIsSaving(true);
    try {
      // Clone workbook by writing and re-reading
      const cloneBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const wb = XLSX.read(cloneBuffer, { type: "array" });

      // Apply all edits to the clone
      for (const [sheetName, edits] of sheetEdits) {
        const worksheet = wb.Sheets[sheetName];
        if (!worksheet) continue;

        // Track max row/col for range update
        let maxRow = 0, maxCol = 0;
        const range = worksheet["!ref"];
        if (range) {
          const decoded = XLSX.utils.decode_range(range);
          maxRow = decoded.e.r;
          maxCol = decoded.e.c;
        }

        for (const [cellKey, value] of edits) {
          const [rowStr, colStr] = cellKey.split(",");
          const row = parseInt(rowStr, 10);
          const col = parseInt(colStr, 10);
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });

          maxRow = Math.max(maxRow, row);
          maxCol = Math.max(maxCol, col);

          if (value === "") {
            delete worksheet[cellAddress];
          } else {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              worksheet[cellAddress] = { t: "n", v: numValue };
            } else {
              worksheet[cellAddress] = { t: "s", v: value };
            }
          }
        }

        // Update range
        worksheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
      }

      // Write to file
      const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileName = getFileName(filePath, "workbook.xlsx");
      const file = new File([new Uint8Array(buffer)], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      await runtimeActions.writeFile(file, getParentDir(filePath));

      // Update state with saved workbook and clear edits
      setWorkbook(wb);
      setSheetEdits(new Map());
    } catch (e) {
      console.error("Failed to save Excel:", e);
    } finally {
      setIsSaving(false);
    }
  }, [workbook, sheetEdits, hasEdits, filePath, runtimeActions]);

  // Auto-save after 1 second of no changes
  useEffect(() => {
    if (!hasEdits) return;
    const timeout = setTimeout(handleSave, EXCEL_AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [hasEdits, handleSave]);

  const rowVirtualizer = useVirtualizer({
    count: sheetData.rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => EXCEL_ROW_HEIGHT,
    overscan: 10,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: sheetData.colCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => EXCEL_COL_WIDTH,
    overscan: 5,
  });

  if (loading) {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full text-neutral-500">
        <div className="text-center">
          <p className="font-medium">Failed to load Excel file</p>
          <p className="text-sm mt-1 text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  const sheetNames = workbook.SheetNames;
  const { grid, colCount, rowCount } = sheetData;

  if (rowCount === 0 || colCount === 0) {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 overflow-hidden flex flex-col gap-2">
        {sheetNames.length > 1 && (
          <SheetTabs
            sheetNames={sheetNames}
            activeSheetIndex={activeSheetIndex}
            onSelectSheet={setActiveSheetIndex}
          />
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileSpreadsheet size={32} className="mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">This sheet is empty</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background p-4 overflow-hidden flex flex-col gap-2">
      {/* Header with sheet tabs and table view toggle */}
      <div className="flex items-center justify-between gap-2">
        {sheetNames.length > 1 ? (
          <SheetTabs
            sheetNames={sheetNames}
            activeSheetIndex={activeSheetIndex}
            onSelectSheet={setActiveSheetIndex}
          />
        ) : (
          <div />
        )}
        <button
          onClick={onToggleTableView}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0",
            showTableView
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "bg-white dark:bg-card text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-muted border border-neutral-200 dark:border-border"
          )}
        >
          <PanelRight size={12} />
          Table View
        </button>
      </div>
      <div className="flex-1 bg-white dark:bg-card rounded-lg border border-neutral-200 dark:border-border overflow-hidden flex flex-col">
        <div
          ref={containerRef}
          className="flex-1 overflow-auto"
        >
          <div
            style={{
              width: EXCEL_ROW_HEADER_WIDTH + colVirtualizer.getTotalSize(),
              height: EXCEL_ROW_HEIGHT + rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {/* Corner cell (empty) */}
            <div
              className="sticky top-0 left-0 z-30 bg-neutral-100 dark:bg-muted border-b border-r border-neutral-200 dark:border-border"
              style={{
                width: EXCEL_ROW_HEADER_WIDTH,
                height: EXCEL_ROW_HEIGHT,
              }}
            />

            {/* Column headers */}
            <div
              className="sticky top-0 z-20"
              style={{
                position: "absolute",
                left: EXCEL_ROW_HEADER_WIDTH,
                height: EXCEL_ROW_HEIGHT,
                width: colVirtualizer.getTotalSize(),
              }}
            >
              {colVirtualizer.getVirtualItems().map((virtualCol) => (
                <div
                  key={virtualCol.key}
                  className="absolute top-0 bg-neutral-100 dark:bg-muted border-b border-r border-neutral-200 dark:border-border flex items-center justify-center text-xs font-semibold text-neutral-600 dark:text-neutral-400"
                  style={{
                    left: virtualCol.start,
                    width: virtualCol.size,
                    height: EXCEL_ROW_HEIGHT,
                  }}
                >
                  {columnLabel(virtualCol.index)}
                </div>
              ))}
            </div>

            {/* Row headers */}
            <div
              className="sticky left-0 z-20"
              style={{
                position: "absolute",
                top: EXCEL_ROW_HEIGHT,
                width: EXCEL_ROW_HEADER_WIDTH,
                height: rowVirtualizer.getTotalSize(),
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 bg-neutral-100 dark:bg-muted border-b border-r border-neutral-200 dark:border-border flex items-center justify-center text-xs font-semibold text-neutral-600 dark:text-neutral-400"
                  style={{
                    top: virtualRow.start,
                    width: EXCEL_ROW_HEADER_WIDTH,
                    height: virtualRow.size,
                  }}
                >
                  {virtualRow.index + 1}
                </div>
              ))}
            </div>

            {/* Floating SQL Button */}
            {selection && hasMultipleCells(selection) && !isSelecting && !showSqlInput && (
              <div
                className="absolute z-30"
                style={{
                  top: EXCEL_ROW_HEIGHT + (getSelectionBounds(selection).maxRow + 1) * EXCEL_ROW_HEIGHT + 4,
                  left: EXCEL_ROW_HEADER_WIDTH + (getSelectionBounds(selection).maxCol + 1) * EXCEL_COL_WIDTH - 70,
                }}
              >
                <button
                  onClick={handleOpenSqlInput}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-md shadow-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
                >
                  Edit SQL
                </button>
              </div>
            )}

            {/* SQL Input Popover */}
            {selection && showSqlInput && (
              <div
                className="absolute z-40"
                style={{
                  top: EXCEL_ROW_HEIGHT + (getSelectionBounds(selection).maxRow + 1) * EXCEL_ROW_HEIGHT + 4,
                  left: EXCEL_ROW_HEADER_WIDTH + getSelectionBounds(selection).minCol * EXCEL_COL_WIDTH,
                }}
              >
                <div className="bg-white dark:bg-card border border-neutral-200 dark:border-border rounded-lg shadow-xl p-3 w-80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Transform with SQL
                    </span>
                    <button
                      onClick={handleCloseSqlInput}
                      className="p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
                    >
                      <X size={14} className="text-neutral-500" />
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-2">
                    Query the <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">cells</code> table with <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">row</code>, <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">col</code>, <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">value</code> columns
                  </p>
                  <textarea
                    ref={sqlInputRef}
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const target = e.target as HTMLTextAreaElement;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const newValue = sqlQuery.substring(0, start) + "\t" + sqlQuery.substring(end);
                        setSqlQuery(newValue);
                        setTimeout(() => {
                          target.selectionStart = target.selectionEnd = start + 1;
                        }, 0);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCloseSqlInput();
                      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (previewEdits) {
                          handleAcceptPreview();
                        } else {
                          handlePreviewSql();
                        }
                      }
                    }}
                    placeholder="SELECT row, col, value * 2 as value FROM cells WHERE value > 10"
                    className="w-full h-32 px-2 py-1.5 text-xs font-mono bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {sqlError && (
                    <p className="text-[10px] text-red-500 mt-1">{sqlError}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-neutral-400">⌘+Enter to preview</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCloseSqlInput}
                        className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
                      >
                        Cancel
                      </button>
                      {previewEdits ? (
                        <>
                          <button
                            onClick={handleRevertPreview}
                            className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
                          >
                            Revert
                          </button>
                          <button
                            onClick={handleAcceptPreview}
                            className="px-2 py-1 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
                          >
                            Accept
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handlePreviewSql}
                          disabled={!sqlQuery.trim() || isExecutingSql}
                          className="px-2 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {isExecutingSql && <Loader2 size={10} className="animate-spin" />}
                          Preview
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Data cells */}
            <div
              style={{
                position: "absolute",
                top: EXCEL_ROW_HEIGHT,
                left: EXCEL_ROW_HEADER_WIDTH,
                width: colVirtualizer.getTotalSize(),
                height: rowVirtualizer.getTotalSize(),
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div key={virtualRow.key}>
                  {colVirtualizer.getVirtualItems().map((virtualCol) => {
                    const row = virtualRow.index;
                    const col = virtualCol.index;
                    const cellKey = getCellKey(row, col);
                    const displayValue = getCellValue(row, col, grid);
                    const isSelected = isInSelection(row, col, selection);
                    const isActive = isActiveCell(row, col, selection);
                    const isCellEditing = editingCell?.row === row && editingCell?.col === col;

                    return (
                      <GridCell
                        key={cellKey}
                        row={row}
                        col={col}
                        top={virtualRow.start}
                        left={virtualCol.start}
                        width={virtualCol.size}
                        height={virtualRow.size}
                        value={displayValue}
                        isSelected={isSelected}
                        isActive={isActive}
                        isEditing={isCellEditing}
                        editValue={editValue}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        onDoubleClick={handleCellDoubleClick}
                        onEditChange={setEditValue}
                        onEditKeyDown={handleEditKeyDown}
                        onEditBlur={commitEdit}
                        editInputRef={editInputRef}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 font-mono text-xs text-neutral-400 dark:text-neutral-500 border-t border-neutral-200/50 dark:border-border/50 bg-neutral-50/50 dark:bg-muted/20">
          <span>
            {selection ? (
              selection.start.row === selection.end.row && selection.start.col === selection.end.col
                ? `${columnLabel(selection.start.col)}${selection.start.row + 1}`
                : `${columnLabel(selection.start.col)}${selection.start.row + 1}:${columnLabel(selection.end.col)}${selection.end.row + 1}`
            ) : (
              `${rowCount} row${rowCount !== 1 ? "s" : ""} × ${colCount} column${colCount !== 1 ? "s" : ""}`
            )}
          </span>
          <div className="flex items-center gap-3">
            {isSaving && (
              <span className="flex items-center gap-1 text-green-500 dark:text-green-400">
                <Loader2 size={10} className="animate-spin" />
                Saving...
              </span>
            )}
            {selection && (
              <span className="text-neutral-500 dark:text-neutral-400">
                {Math.abs(selection.end.row - selection.start.row) + 1} × {Math.abs(selection.end.col - selection.start.col) + 1} cells
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function SheetTabs({
  sheetNames,
  activeSheetIndex,
  onSelectSheet,
}: {
  sheetNames: string[];
  activeSheetIndex: number;
  onSelectSheet: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {sheetNames.map((name, index) => (
        <button
          key={name}
          onClick={() => onSelectSheet(index)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
            index === activeSheetIndex
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "bg-white dark:bg-card text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-muted border border-neutral-200 dark:border-border"
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

interface ExcelTableViewSidebarProps {
  cells: SelectedCellData[];
}

function ExcelTableViewSidebar({ cells }: ExcelTableViewSidebarProps) {
  return (
    <div className="w-60 border-l border-stone-200 dark:border-border bg-white dark:bg-sidebar flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200/50 dark:border-border/50">
        <h3 className="text-sm font-medium text-neutral-950 dark:text-foreground">
          Table
        </h3>
        <p className="text-[10px] text-neutral-400 dark:text-muted-foreground mt-0.5">
          {cells.length} cell{cells.length !== 1 ? "s" : ""} selected
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {cells.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-neutral-400 dark:text-muted-foreground">
              Select cells in the spreadsheet to see their values here
            </p>
          </div>
        ) : (
          <div className="text-xs font-mono">
            {/* Header */}
            <div className="grid grid-cols-[50px_50px_1fr] border-b border-neutral-200 dark:border-border sticky top-0 bg-neutral-50 dark:bg-muted">
              <div className="px-2 py-1.5 font-semibold text-neutral-600 dark:text-neutral-400 border-r border-neutral-200/50 dark:border-border/50">
                row
              </div>
              <div className="px-2 py-1.5 font-semibold text-neutral-600 dark:text-neutral-400 border-r border-neutral-200/50 dark:border-border/50">
                col
              </div>
              <div className="px-2 py-1.5 font-semibold text-neutral-600 dark:text-neutral-400">
                value
              </div>
            </div>
            {/* Data rows */}
            {cells.map((cell, idx) => (
              <div
                key={`${cell.row}-${cell.col}`}
                className={cn(
                  "grid grid-cols-[50px_50px_1fr] border-b border-neutral-200/30 dark:border-border/30",
                  idx % 2 === 0 ? "bg-white dark:bg-card" : "bg-neutral-50/50 dark:bg-muted/30"
                )}
              >
                <div className="px-2 py-1.5 text-neutral-500 dark:text-neutral-400 border-r border-neutral-200/30 dark:border-border/30">
                  {cell.row + 1}
                </div>
                <div className="px-2 py-1.5 text-neutral-500 dark:text-neutral-400 border-r border-neutral-200/30 dark:border-border/30">
                  {columnLabel(cell.col).toLowerCase()}
                </div>
                <div className="px-2 py-1.5 text-neutral-900 dark:text-neutral-100 truncate" title={cell.value}>
                  {cell.value || <span className="text-neutral-300 dark:text-neutral-600 italic">empty</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExcelFileViewer({ filePath, runtime }: FileViewerProps) {
  const [showTableView, setShowTableView] = useState(true);
  const [selectedCells, setSelectedCells] = useState<SelectedCellData[]>([]);

  const runtimeActions = useMemo<ExcelRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
      runSQL: runtime.runSQL,
    }),
    [runtime.readFile, runtime.writeFile, runtime.runSQL]
  );

  const handleToggleTableView = useCallback(() => {
    setShowTableView(prev => !prev);
  }, []);

  const handleSelectionChange = useCallback((cells: SelectedCellData[]) => {
    setSelectedCells(cells);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ExcelFileViewerInner
        filePath={filePath}
        runtimeActions={runtimeActions}
        showTableView={showTableView}
        onToggleTableView={handleToggleTableView}
        onSelectionChange={handleSelectionChange}
      />
      {showTableView && <ExcelTableViewSidebar cells={selectedCells} />}
    </div>
  );
}
