import {
  getCellType,
  getExecutableSource,
  getSourceString,
  isCodeCell,
  type CodeCell,
  type DataSprenCellType,
  type MarkdownCell,
  type NotebookCell,
} from "../../runtime";
import { generateId } from "../utils";

// ============================================================================
// Cell Creation
// ============================================================================

export function createCodeCell(
  datasprenType: DataSprenCellType,
  viewNumber?: number,
): CodeCell {
  return {
    id: generateId(),
    cell_type: "code",
    source: datasprenType === "sql" ? "%sql\n" : "",
    outputs: [],
    execution_count: null,
    metadata: {
      viewName: datasprenType === "sql" ? `t${viewNumber ?? 1}` : undefined,
    },
  };
}

export function createMarkdownCell(): MarkdownCell {
  return {
    id: generateId(),
    cell_type: "markdown",
    source: "",
    metadata: {},
  };
}

export function createDefaultCell(): CodeCell {
  return {
    id: generateId(),
    cell_type: "code",
    source: "",
    outputs: [],
    execution_count: null,
    metadata: {},
  };
}

// ============================================================================
// Cell CRUD
// ============================================================================

export function insertCellAfter(
  cells: NotebookCell[],
  newCell: NotebookCell,
  afterId?: string,
): NotebookCell[] {
  if (afterId) {
    const index = cells.findIndex((c) => c.id === afterId);
    return [...cells.slice(0, index + 1), newCell, ...cells.slice(index + 1)];
  }
  return [...cells, newCell];
}

export function removeCell(cells: NotebookCell[], id: string): NotebookCell[] {
  const filtered = cells.filter((c) => c.id !== id);
  if (filtered.length === 0) {
    return [createDefaultCell()];
  }
  return filtered;
}

export function swapCells(
  cells: NotebookCell[],
  id: string,
  direction: "up" | "down",
): NotebookCell[] {
  const index = cells.findIndex((c) => c.id === id);
  if (direction === "up") {
    if (index <= 0) return cells;
    const newCells = [...cells];
    [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
    return newCells;
  }
  if (index === -1 || index >= cells.length - 1) return cells;
  const newCells = [...cells];
  [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
  return newCells;
}

export function convertCellType(
  cell: NotebookCell,
  datasprenType: DataSprenCellType | "markdown",
  viewNumber: number,
): NotebookCell {
  if (datasprenType === "markdown") {
    return {
      id: cell.id,
      cell_type: "markdown",
      source: getExecutableSource(cell.source),
      metadata: {},
    } satisfies MarkdownCell;
  }

  const currentSource = getSourceString(cell.source);
  const currentType = getCellType(cell.source);
  let newSource: string;

  if (datasprenType === "sql" && currentType !== "sql") {
    newSource = `%sql\n${currentSource}`;
  } else if (datasprenType === "python" && currentType === "sql") {
    newSource = getExecutableSource(cell.source);
  } else {
    newSource = currentSource;
  }

  const needsViewName = datasprenType === "sql" && !cell.metadata.viewName;

  return {
    id: cell.id,
    cell_type: "code",
    source: newSource,
    outputs: [],
    execution_count: null,
    metadata: {
      ...cell.metadata,
      viewName: needsViewName ? `t${viewNumber}` : cell.metadata.viewName,
    },
  };
}

// ============================================================================
// Derived State
// ============================================================================

export function buildCellLookup(cells: NotebookCell[]): Map<string, NotebookCell> {
  const map = new Map<string, NotebookCell>();
  for (const cell of cells) {
    map.set(cell.id, cell);
  }
  return map;
}

export function extractCellIds(cells: NotebookCell[]): string[] {
  return cells.map((c) => c.id);
}

export function getMaxExecutionCount(cells: NotebookCell[]): number {
  return Math.max(
    0,
    ...cells.map((c) => (isCodeCell(c) ? (c.execution_count ?? 0) : 0)),
  );
}
