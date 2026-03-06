import type { ExecutionResult, PythonVariable, RegisteredFunction, TableInfo } from "../../core/types";
import type { FileInfo, WorkerRequest, WorkerResponse } from "../../workers/pyodide.worker.types";
import type {
  ExecutionBackendChangeCallback,
  ExecutionStatus,
  IExecutionBackend,
} from "./interface";

import { MOUNT_ROOT } from "../../../lib/paths";
const STORAGE_MOUNT_PATH = MOUNT_ROOT;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let globalRequestId = 0;
function generateRequestId(): string {
  return `req_${++globalRequestId}_${Date.now()}`;
}

const LOG_PREFIX = "[PyodideBackend]";

export class PyodideExecutionBackend implements IExecutionBackend {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private initPromise: Promise<void> | null = null;

  private _status: ExecutionStatus = {
    isLoading: false,
    isReady: false,
    isDuckDBReady: false,
    s3Status: "idle",
    error: null,
  };

  private changeListeners = new Set<ExecutionBackendChangeCallback>();

  get status(): ExecutionStatus {
    return { ...this._status };
  }

  get storagePath(): string {
    return STORAGE_MOUNT_PATH;
  }

  private updateStatus(updates: Partial<ExecutionStatus>): void {
    this._status = { ...this._status, ...updates };
    this.emitChange({ type: "status", data: this.status });
  }

  private async emitFilesChange(): Promise<void> {
    const files = await this.listFiles();
    this.emitChange({ type: "files", data: files });
  }

  private emitChange(event: { type: "status"; data: ExecutionStatus } | { type: "files"; data: FileInfo[] }): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    console.log(LOG_PREFIX, "Creating web worker...");
    const startTime = performance.now();

    const worker = new Worker(
      new URL("../../workers/pyodide.worker.ts", import.meta.url),
      { type: "module" },
    );

    console.log(LOG_PREFIX, `Worker created in ${(performance.now() - startTime).toFixed(1)}ms`);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      if (response.type === "status") {
        if (response.status === "loading") {
          console.log(LOG_PREFIX, "Pyodide loading started...");
          this.updateStatus({ isLoading: true });
        } else if (response.status === "ready") {
          console.log(LOG_PREFIX, "Pyodide runtime ready");
          this.updateStatus({ isReady: true, isLoading: false });
        } else if (response.status === "duckdb-ready") {
          console.log(LOG_PREFIX, "DuckDB initialized and ready");
          this.updateStatus({ isDuckDBReady: true });
        } else if (response.status === "s3-mounting") {
          console.log(LOG_PREFIX, "S3 storage mounting...");
          this.updateStatus({ s3Status: "mounting" });
        } else if (response.status === "s3-ready") {
          console.log(LOG_PREFIX, "S3 storage ready");
          this.updateStatus({ s3Status: "ready" });
        } else if (response.status === "s3-error") {
          console.log(LOG_PREFIX, "S3 storage unavailable");
          this.updateStatus({ s3Status: "error" });
        }
        return;
      }

      if (response.type === "s3-files") {
        console.log(LOG_PREFIX, `S3 files received: ${response.files.length} files`);
        this.emitChange({ type: "files", data: response.files });
        return;
      }

      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;

      this.pendingRequests.delete(response.id);

      if (response.type === "error") {
        pending.reject(new Error(response.error));
        return;
      }

      switch (response.type) {
        case "init":
          if (response.success) {
            pending.resolve(undefined);
          } else {
            pending.reject(new Error(response.error));
          }
          break;
        case "runPython":
        case "runSQL":
          pending.resolve(response.result);
          break;
        case "getTables":
          pending.resolve(response.tables);
          break;
        case "getFunctions":
          pending.resolve(response.functions);
          break;
        case "getVariables":
          pending.resolve(response.variables);
          break;
        case "listFiles":
          pending.resolve(response.files);
          break;
        case "writeFile":
          pending.resolve(response);
          break;
        case "readFile":
          pending.resolve(response.data);
          break;
        case "deleteFile":
          pending.resolve(response.success);
          break;
        case "fileExists":
          pending.resolve(response.exists);
          break;
        case "moveFile":
          pending.resolve(response);
          break;
        case "renameFile":
          pending.resolve(response);
          break;
        case "createDirectory":
        case "renameDirectory":
          pending.resolve(response);
          break;
        case "deleteDirectory":
          pending.resolve(response.success);
          break;
        case "convertFile":
          pending.resolve(response.data);
          break;
      }
    };

    worker.onerror = (error) => {
      const errorMessage = error.message || "Worker crashed unexpectedly";
      this.updateStatus({ error: errorMessage, isLoading: false });

      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error(errorMessage));
      }
      this.pendingRequests.clear();
    };

    this.worker = worker;
    return worker;
  }

  private sendRequest<T>(request: WorkerRequest, transferables?: Transferable[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const worker = this.getWorker();
      this.pendingRequests.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      if (transferables?.length) {
        worker.postMessage(request, transferables);
      } else {
        worker.postMessage(request);
      }
    });
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      console.log(LOG_PREFIX, "Init already in progress, waiting...");
      return this.initPromise;
    }

    console.log(LOG_PREFIX, "Starting initialization...");
    const startTime = performance.now();

    this.updateStatus({ isLoading: true, error: null });

    this.initPromise = this.sendRequest<void>({
      type: "init",
      id: generateRequestId(),
    }).then(() => {
      console.log(LOG_PREFIX, `Initialization complete in ${(performance.now() - startTime).toFixed(0)}ms`);
    }).catch((err) => {
      console.error(LOG_PREFIX, "Initialization failed:", err);
      this.updateStatus({
        error: err instanceof Error ? err.message : String(err),
      });
      this.initPromise = null;
      throw err;
    });

    return this.initPromise;
  }

  async runPython(code: string): Promise<ExecutionResult> {
    await this.init();
    return this.sendRequest<ExecutionResult>({
      type: "runPython",
      id: generateRequestId(),
      code,
    });
  }

  async runSQL(sql: string, viewName?: string): Promise<ExecutionResult> {
    await this.init();
    return this.sendRequest<ExecutionResult>({
      type: "runSQL",
      id: generateRequestId(),
      sql,
      viewName,
    });
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.initPromise) return [];
    await this.init();
    return this.sendRequest<TableInfo[]>({
      type: "getTables",
      id: generateRequestId(),
    });
  }

  async getFunctions(): Promise<RegisteredFunction[]> {
    if (!this.initPromise) return [];
    await this.init();
    return this.sendRequest<RegisteredFunction[]>({
      type: "getFunctions",
      id: generateRequestId(),
    });
  }

  async getVariables(): Promise<PythonVariable[]> {
    if (!this.initPromise) return [];
    await this.init();
    return this.sendRequest<PythonVariable[]>({
      type: "getVariables",
      id: generateRequestId(),
    });
  }

  async listFiles(): Promise<FileInfo[]> {
    if (!this.initPromise) return [];
    await this.init();
    return this.sendRequest<FileInfo[]>({
      type: "listFiles",
      id: generateRequestId(),
    });
  }

  async writeFile(name: string, data: ArrayBuffer | Uint8Array, options?: { silent?: boolean }): Promise<string> {
    await this.init();
    let buffer: ArrayBuffer;
    if (data instanceof Uint8Array) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else {
      buffer = data;
    }
    const bufferCopy = buffer.slice(0);

    type WriteResponse = { success: true; path: string } | { success: false; error: string };
    const response = await this.sendRequest<WriteResponse>(
      {
        type: "writeFile",
        id: generateRequestId(),
        name,
        data: bufferCopy,
      },
      [bufferCopy],
    );

    if (!response.success) {
      throw new Error(response.error);
    }

    if (!options?.silent) {
      this.emitFilesChange();
    }
    return response.path;
  }

  async readFile(name: string): Promise<Uint8Array> {
    await this.init();
    const buffer = await this.sendRequest<ArrayBuffer>({
      type: "readFile",
      id: generateRequestId(),
      name,
    });
    return new Uint8Array(buffer);
  }

  async deleteFile(name: string): Promise<boolean> {
    await this.init();
    const success = await this.sendRequest<boolean>({
      type: "deleteFile",
      id: generateRequestId(),
      name,
    });

    if (success) {
      this.emitFilesChange();
    }

    return success;
  }

  async fileExists(name: string): Promise<boolean> {
    if (!this.initPromise) return false;
    await this.init();
    return this.sendRequest<boolean>({
      type: "fileExists",
      id: generateRequestId(),
      name,
    });
  }

  async createDirectory(path: string): Promise<void> {
    await this.init();
    await this.sendRequest<{ success: boolean }>({
      type: "createDirectory",
      id: generateRequestId(),
      path,
    });
    this.emitFilesChange();
  }

  async deleteDirectory(path: string): Promise<boolean> {
    await this.init();
    const success = await this.sendRequest<boolean>({
      type: "deleteDirectory",
      id: generateRequestId(),
      path,
    });
    if (success) {
      this.emitFilesChange();
    }
    return success;
  }

  async renameDirectory(oldPath: string, newName: string): Promise<void> {
    await this.init();
    await this.sendRequest<{ success: boolean }>({
      type: "renameDirectory",
      id: generateRequestId(),
      oldPath,
      newName,
    });
    this.emitFilesChange();
  }

  async moveFile(sourcePath: string, targetDir: string): Promise<void> {
    await this.init();
    type MoveResponse = { success: true; newPath: string } | { success: false; error: string };
    const response = await this.sendRequest<MoveResponse>({
      type: "moveFile",
      id: generateRequestId(),
      sourcePath,
      targetDir,
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.emitFilesChange();
  }

  async renameFile(path: string, newName: string): Promise<void> {
    await this.init();
    type RenameResponse = { success: true; newPath: string } | { success: false; error: string };
    const response = await this.sendRequest<RenameResponse>({
      type: "renameFile",
      id: generateRequestId(),
      path,
      newName,
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.emitFilesChange();
  }

  async convertFile(filePath: string, targetFormat: string): Promise<Uint8Array> {
    await this.init();
    const buffer = await this.sendRequest<ArrayBuffer>({
      type: "convertFile",
      id: generateRequestId(),
      filePath,
      targetFormat,
    });
    return new Uint8Array(buffer);
  }

  async reset(): Promise<void> {
    console.log(LOG_PREFIX, "Resetting runtime...");
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.initPromise = null;
    this._status = {
      isLoading: false,
      isReady: false,
      isDuckDBReady: false,
      s3Status: "idle",
      error: null,
    };
    this.emitChange({ type: "status", data: this.status });
    this.emitChange({ type: "files", data: [] });
    console.log(LOG_PREFIX, "Runtime reset complete");
  }

  dispose(): void {
    console.log(LOG_PREFIX, "Disposing execution backend...");
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.initPromise = null;
    this.changeListeners.clear();
    console.log(LOG_PREFIX, "Execution backend disposed");
  }

  onChange(callback: ExecutionBackendChangeCallback): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }
}
