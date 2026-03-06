import type {
  ExecutionResult,
  PythonVariable,
  RegisteredFunction,
  TableInfo,
} from "../../core/types";

export type FileType = "csv" | "parquet" | "json";

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

export interface ExecutionStatus {
  isLoading: boolean;
  isReady: boolean;
  isDuckDBReady: boolean;
  s3Status: "idle" | "mounting" | "ready" | "error";
  error: string | null;
}

export type ExecutionBackendEvent =
  | { type: "status"; data: ExecutionStatus }
  | { type: "files"; data: FileInfo[] };

export type ExecutionBackendChangeCallback = (event: ExecutionBackendEvent) => void;

export interface IRuntime {
  readonly status: ExecutionStatus;
  init(): Promise<void>;
  runPython(code: string): Promise<ExecutionResult>;
  runSQL(sql: string, viewName?: string): Promise<ExecutionResult>;
  getTables(): Promise<TableInfo[]>;
  getFunctions(): Promise<RegisteredFunction[]>;
  getVariables(): Promise<PythonVariable[]>;
  reset(): Promise<void>;
  dispose(): void;
  onChange(callback: ExecutionBackendChangeCallback): () => void;
}

export interface IRuntimeFileSystem {
  readonly storagePath: string;
  listFiles(): Promise<FileInfo[]>;
  writeFile(name: string, data: ArrayBuffer | Uint8Array, options?: { silent?: boolean }): Promise<string>;
  readFile(name: string): Promise<Uint8Array>;
  deleteFile(name: string): Promise<boolean>;
  fileExists(name: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<boolean>;
  renameDirectory(oldPath: string, newName: string): Promise<void>;
  moveFile(sourcePath: string, targetDir: string): Promise<void>;
  renameFile(path: string, newName: string): Promise<void>;
  convertFile(filePath: string, targetFormat: string): Promise<Uint8Array>;
}

export interface IExecutionBackend extends IRuntime, IRuntimeFileSystem {}
