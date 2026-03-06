export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileTreeNode[];
}

export interface PendingMove {
  sourcePath: string;
  targetDir: string;
  fileName: string;
  existingFileName: string;
}

export type DropTargetDir = string | null;

export interface PendingDelete {
  path: string;
  name: string;
  isDirectory: boolean;
  count?: number;
}

export interface TransferState {
  fileName: string;
  targetDir: string;
  sourcePath: string;
}

export interface PendingNewFile {
  parentDir: string;
  defaultName: string;
}

export interface ContextMenuState {
  node: FileTreeNode;
  x: number;
  y: number;
  key: number;
  selectedPaths: Set<string>;
}
