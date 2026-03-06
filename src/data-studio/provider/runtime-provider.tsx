"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ExecutionResult,
  FileInfo,
  IExecutionBackend,
  PythonVariable,
  RegisteredFunction,
  TableInfo,
} from "../runtime";
import { toRelativePath, toOPFSPath } from "../lib/paths";
import { listOPFSFiles, readOPFSFile, writeOPFSFile } from "../runtime/opfs-list";
import { Button } from "@/components/ui/button";
import { useWebLock } from "./hooks/use-web-lock";
import { useExecutionStatus } from "./hooks/use-execution-status";
import { useBroadcastFileSync } from "./hooks/use-broadcast-file-sync";
import { useEarlyOPFSLoad } from "./hooks/use-early-opfs-load";
import { useAutoInit } from "./hooks/use-auto-init";

export interface RuntimeContextValue {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  s3Status: "idle" | "mounting" | "ready" | "error";
  dataFiles: FileInfo[];
  tables: TableInfo[];
  functions: RegisteredFunction[];
  variables: PythonVariable[];
  writeFile: (file: File, targetDir?: string) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<boolean>;
  createDirectory: (path: string) => Promise<void>;
  deleteDirectory: (path: string) => Promise<boolean>;
  renameDirectory: (oldPath: string, newName: string) => Promise<void>;
  moveFile: (sourcePath: string, targetDir: string) => Promise<void>;
  renameFile: (path: string, newName: string) => Promise<void>;
  runSQL: (sql: string, viewName?: string) => Promise<ExecutionResult>;
  runPython: (code: string) => Promise<ExecutionResult>;
  convertFile: (filePath: string, targetFormat: string) => Promise<Uint8Array>;
  refreshTables: () => Promise<void>;
  refreshFunctions: () => Promise<void>;
  refreshVariables: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  reset: () => Promise<void>;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
const ExecutionBackendContext = createContext<IExecutionBackend | null>(null);

const TAB_LOCK_NAME = "data-studio-runtime";

interface RuntimeProviderProps {
  execution: IExecutionBackend;
  autoInit?: boolean;
  children: ReactNode;
}

export function RuntimeProvider({ execution, autoInit = true, children }: RuntimeProviderProps) {
  const { tabBlocked } = useWebLock(TAB_LOCK_NAME);
  const { executionStatus, dataFiles, setDataFiles } = useExecutionStatus(execution);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [functions, setFunctions] = useState<RegisteredFunction[]>([]);
  const [variables, setVariables] = useState<PythonVariable[]>([]);

  const { broadcastFileChange } = useBroadcastFileSync(
    "data-studio-files",
    useCallback(() => {
      execution.listFiles().then(setDataFiles);
    }, [execution, setDataFiles]),
  );

  useEarlyOPFSLoad(setDataFiles);
  useAutoInit(execution, autoInit);

  const refreshTables = useCallback(async () => {
    const tableList = await execution.getTables();
    setTables(tableList);
  }, [execution]);

  const refreshFunctions = useCallback(async () => {
    const functionList = await execution.getFunctions();
    setFunctions(functionList);
  }, [execution]);

  const refreshVariables = useCallback(async () => {
    const variableList = await execution.getVariables();
    setVariables(variableList);
  }, [execution]);

  const refreshFiles = useCallback(async () => {
    const files = await execution.listFiles();
    setDataFiles(files);
  }, [execution, setDataFiles]);

  useEffect(() => {
    if (!executionStatus.isDuckDBReady) return;
    execution.listFiles().then(setDataFiles);
    refreshTables();
    refreshFunctions();
    refreshVariables();
  }, [executionStatus.isDuckDBReady, execution, setDataFiles, refreshTables, refreshFunctions, refreshVariables]);

  const handleWriteFile = useCallback(
    async (file: File, targetDir?: string): Promise<void> => {
      const dir = targetDir ?? "/mnt/local";
      const fullPath = `${dir}/${file.name}`;
      const data = new Uint8Array(await file.arrayBuffer());

      if (executionStatus.isDuckDBReady) {
        await execution.writeFile(toRelativePath(fullPath), data);
        const files = await execution.listFiles();
        setDataFiles(files);
      } else {
        await writeOPFSFile(toOPFSPath(fullPath), data);
        const files = await listOPFSFiles();
        setDataFiles(files);
      }

      broadcastFileChange();
    },
    [execution, executionStatus.isDuckDBReady, setDataFiles, broadcastFileChange],
  );

  const handleReadFile = useCallback(
    async (name: string): Promise<Uint8Array> => {
      const path = name.startsWith("/mnt/") ? name : `/mnt/local/${name}`;

      if (executionStatus.isDuckDBReady) {
        return execution.readFile(toRelativePath(path));
      }

      return readOPFSFile(toOPFSPath(path));
    },
    [execution, executionStatus.isDuckDBReady],
  );

  const handleDeleteFile = useCallback(
    async (name: string): Promise<boolean> => {
      const path = name.startsWith("/mnt/") ? name : `/mnt/local/${name}`;
      const success = await execution.deleteFile(toRelativePath(path));
      if (success) {
        const files = await execution.listFiles();
        setDataFiles(files);
        broadcastFileChange();
      }
      return success;
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleCreateDirectory = useCallback(
    async (path: string): Promise<void> => {
      await execution.createDirectory(path);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleDeleteDirectory = useCallback(
    async (path: string): Promise<boolean> => {
      const success = await execution.deleteDirectory(path);
      if (success) {
        const files = await execution.listFiles();
        setDataFiles(files);
        broadcastFileChange();
      }
      return success;
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleRenameDirectory = useCallback(
    async (oldPath: string, newName: string): Promise<void> => {
      await execution.renameDirectory(oldPath, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleMoveFile = useCallback(
    async (sourcePath: string, targetDir: string): Promise<void> => {
      await execution.moveFile(sourcePath, targetDir);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleRenameFile = useCallback(
    async (path: string, newName: string): Promise<void> => {
      await execution.renameFile(path, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, setDataFiles, broadcastFileChange],
  );

  const handleRunSQL = useCallback(
    async (sql: string, viewName?: string) => execution.runSQL(sql, viewName),
    [execution],
  );

  const handleRunPython = useCallback(
    async (code: string) => execution.runPython(code),
    [execution],
  );

  const handleConvertFile = useCallback(
    (filePath: string, targetFormat: string) => execution.convertFile(filePath, targetFormat),
    [execution],
  );

  const handleReset = useCallback(async () => {
    setTables([]);
    setFunctions([]);
    setVariables([]);
    console.log("[RuntimeProvider] Resetting execution backend...");
    await execution.reset();
    await execution.init();
    console.log("[RuntimeProvider] Reset complete");
    await refreshTables();
  }, [execution, refreshTables]);

  const value = useMemo<RuntimeContextValue>(
    () => ({
      isReady: executionStatus.isDuckDBReady,
      isLoading: executionStatus.isLoading,
      error: executionStatus.error,
      s3Status: executionStatus.s3Status,
      dataFiles,
      tables,
      functions,
      variables,
      writeFile: handleWriteFile,
      readFile: handleReadFile,
      deleteFile: handleDeleteFile,
      createDirectory: handleCreateDirectory,
      deleteDirectory: handleDeleteDirectory,
      renameDirectory: handleRenameDirectory,
      moveFile: handleMoveFile,
      renameFile: handleRenameFile,
      runSQL: handleRunSQL,
      runPython: handleRunPython,
      convertFile: handleConvertFile,
      refreshTables,
      refreshFunctions,
      refreshVariables,
      refreshFiles,
      reset: handleReset,
    }),
    [
      executionStatus.isDuckDBReady, executionStatus.isLoading, executionStatus.error, executionStatus.s3Status,
      dataFiles, tables, functions, variables,
      handleWriteFile, handleReadFile, handleDeleteFile,
      handleCreateDirectory, handleDeleteDirectory, handleRenameDirectory,
      handleMoveFile, handleRenameFile, handleRunSQL, handleRunPython, handleConvertFile,
      refreshTables, refreshFunctions, refreshVariables, refreshFiles, handleReset,
    ],
  );

  if (tabBlocked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-xl font-semibold tracking-tight">DataStudio</p>
          <p className="text-sm text-muted-foreground">
            DataStudio uses the Origin Private File System for local data
            processing, which only supports a single active session. Please
            close the other tab, then click retry.
          </p>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ExecutionBackendContext.Provider value={execution}>
      <RuntimeContext.Provider value={value}>
        {children}
      </RuntimeContext.Provider>
    </ExecutionBackendContext.Provider>
  );
}

export function useRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("useRuntime must be used within a RuntimeProvider");
  return context;
}

/** @internal Used by NotebookProvider and CellProvider for direct backend access */
export function useExecutionBackend(): IExecutionBackend {
  const context = useContext(ExecutionBackendContext);
  if (!context) throw new Error("useExecutionBackend must be used within a RuntimeProvider");
  return context;
}
