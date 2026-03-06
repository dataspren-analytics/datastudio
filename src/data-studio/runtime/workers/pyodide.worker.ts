import type {
  FileInfo,
  PyodideExecutionResult,
  PythonVariable,
  RegisteredFunction,
  TableInfo,
  WorkerRequest,
  WorkerResponse,
} from "./pyodide.worker.types";
import type { IVirtualFSDevice } from "./virtual-fs-device";
import { INIT_PYTHON_CODE } from "./init-python";
import { createOPFSDevice } from "./opfs-device";
import { createVirtualFSDevice } from "./virtual-fs-device";

type EmscriptenFS = {
  writeFile: (path: string, data: Uint8Array | string, opts?: { encoding?: string }) => void;
  readFile: (path: string, opts?: { encoding?: string }) => Uint8Array | string;
  unlink: (path: string) => void;
  mkdir: (path: string) => void;
  mkdirTree: (path: string) => void;
  rmdir: (path: string) => void;
  readdir: (path: string) => string[];
  stat: (path: string) => { size: number; mode: number; isDirectory: () => boolean };
  isDir: (mode: number) => boolean;
  mount: (fsType: unknown, opts: object, mountPoint: string) => void;
  syncfs: (populate: boolean, callback: (err: Error | null) => void) => void;
  filesystems: {
    MEMFS: unknown;
    IDBFS: unknown;
  };
  makedev: (major: number, minor: number) => number;
  registerDevice: (dev: number, ops: unknown) => void;
  mknod: (path: string, mode: number, dev: number) => void;
  lookupPath: (path: string) => { node: { name: string; size: number; mode: number; opfsHandle?: unknown } };
  open: (path: string, flags: string) => number;
  read: (fd: number, buffer: Uint8Array, offset: number, length: number, position: number) => number;
  close: (fd: number) => void;
  chdir: (path: string) => void;
};

type PyodideInstance = {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<void>;
  setStdout: (config: { batched: (msg: string) => void }) => void;
  setStderr: (config: { batched: (msg: string) => void }) => void;
  version: string;
  FS: EmscriptenFS;
};

declare function importScripts(...urls: string[]): void;

declare const loadPyodide: (config: { indexURL: string }) => Promise<PyodideInstance>;

const PYODIDE_VERSION = "0.27.5";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const LOG_PREFIX = "[PyodideWorker]";

let pyodide: PyodideInstance | null = null;
let pyodideLoadingPromise: Promise<PyodideInstance> | null = null;
let duckdbInitPromise: Promise<void> | null = null;
let isDuckDBReady = false;

import { MOUNT_ROOT, toRelativePath } from "../../lib/paths";

let virtualFS: IVirtualFSDevice | null = null;
const STORAGE_MOUNT_PATH = MOUNT_ROOT;
const LOCAL_STORAGE_SUBPATH = "local";

// Idle handle suspension: close OPFS sync handles after inactivity so other
// tabs can access the same OPFS files without NoModificationAllowedError.
const HANDLE_IDLE_TIMEOUT_MS = 5000;
let handleIdleTimer: ReturnType<typeof setTimeout> | null = null;

// Track active executions (runSQL, runPython, etc.) to prevent handle
// suspension while DuckDB or Python code is reading through OPFS handles.
let activeExecutions = 0;

/**
 * Resume OPFS handles before code execution and cancel the idle timer.
 */
async function resumeHandlesIfNeeded(): Promise<void> {
  if (handleIdleTimer !== null) {
    clearTimeout(handleIdleTimer);
    handleIdleTimer = null;
  }
  if (virtualFS) {
    await virtualFS.resumeHandles();
  }
}

/**
 * Schedule handle suspension after a short idle period.
 * Called after each execution completes.
 *
 * Suspension is skipped if there are active executions (runSQL/runPython)
 * because DuckDB reads through OPFS sync handles — closing them mid-query
 * causes a fatal Pyodide crash (InvalidStateError on the access handle).
 */
function scheduleHandleSuspend(): void {
  if (handleIdleTimer !== null) {
    clearTimeout(handleIdleTimer);
  }
  // Don't schedule if there are active executions
  if (activeExecutions > 0) return;
  handleIdleTimer = setTimeout(async () => {
    handleIdleTimer = null;
    // Re-check: a new execution may have started since the timer was set
    if (activeExecutions > 0) return;
    if (virtualFS) {
      await virtualFS.suspendHandles();
    }
  }, HANDLE_IDLE_TIMEOUT_MS);
}

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}

function extractSQLError(errorMessage: string): string {
  const lines = errorMessage.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("duckdb.")) {
      const colonIndex = line.indexOf(": ");
      if (colonIndex !== -1) {
        return line.substring(colonIndex + 2);
      }
      return line;
    }
  }
  return errorMessage;
}

async function loadPyodideInstance(): Promise<PyodideInstance> {
  if (pyodide) return pyodide;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  pyodideLoadingPromise = (async () => {
    console.log(LOG_PREFIX, "Starting Pyodide load...");
    const startTime = performance.now();
    postResponse({ type: "status", status: "loading" });

    console.log(LOG_PREFIX, `Loading Pyodide v${PYODIDE_VERSION} from CDN...`);
    importScripts(`${PYODIDE_CDN}pyodide.js`);
    console.log(
      LOG_PREFIX,
      `Pyodide script loaded in ${(performance.now() - startTime).toFixed(0)}ms`,
    );

    const initStart = performance.now();
    const instance = await loadPyodide({
      indexURL: PYODIDE_CDN,
    });
    console.log(
      LOG_PREFIX,
      `Pyodide initialized in ${(performance.now() - initStart).toFixed(0)}ms`,
    );

    pyodide = instance;
    console.log(
      LOG_PREFIX,
      `Total Pyodide load time: ${(performance.now() - startTime).toFixed(0)}ms`,
    );
    postResponse({ type: "status", status: "ready" });
    return instance;
  })();

  return pyodideLoadingPromise;
}

async function initDuckDB(): Promise<void> {
  if (duckdbInitPromise) return duckdbInitPromise;

  duckdbInitPromise = (async () => {
    console.log(LOG_PREFIX, "Starting DuckDB initialization...");
    const startTime = performance.now();

    const instance = await loadPyodideInstance();

    console.log(LOG_PREFIX, "Loading micropip...");
    await instance.loadPackagesFromImports("import micropip");
    console.log(LOG_PREFIX, `micropip loaded in ${(performance.now() - startTime).toFixed(0)}ms`);

    console.log(LOG_PREFIX, "Installing Python packages (duckdb, pandas, matplotlib)...");
    const packagesStart = performance.now();

    await instance.runPythonAsync(`
import micropip
await micropip.install('duckdb')
await micropip.install('pandas')
await micropip.install('matplotlib')
`);

    await instance.runPythonAsync(INIT_PYTHON_CODE);
    console.log(
      LOG_PREFIX,
      `Python packages installed and configured in ${(performance.now() - packagesStart).toFixed(0)}ms`,
    );
    console.log(
      LOG_PREFIX,
      `Total DuckDB initialization time: ${(performance.now() - startTime).toFixed(0)}ms`,
    );
    isDuckDBReady = true;
    postResponse({ type: "status", status: "duckdb-ready" });
  })();

  return duckdbInitPromise;
}

async function initLocalStorage(): Promise<IVirtualFSDevice> {
  if (virtualFS) return virtualFS;

  if (!pyodide) throw new Error("Pyodide not initialized");

  console.log(LOG_PREFIX, "Initializing virtual filesystem...");

  virtualFS = createVirtualFSDevice(pyodide.FS as Parameters<typeof createVirtualFSDevice>[0]);
  await virtualFS.init(STORAGE_MOUNT_PATH);

  const opfsDevice = createOPFSDevice();
  await opfsDevice.init();

  console.log(LOG_PREFIX, `About to mount OPFS device at ${LOCAL_STORAGE_SUBPATH}...`);
  await virtualFS.mountDevice(LOCAL_STORAGE_SUBPATH, opfsDevice);
  console.log(LOG_PREFIX, `OPFS device mounted successfully`);

  console.log(LOG_PREFIX, `Virtual filesystem mounted at ${STORAGE_MOUNT_PATH}`);
  console.log(LOG_PREFIX, `OPFS mounted at ${STORAGE_MOUNT_PATH}/${LOCAL_STORAGE_SUBPATH}`);

  return virtualFS;
}

function getVFS(): IVirtualFSDevice {
  if (!virtualFS) throw new Error("Virtual filesystem not initialized. Call initStorage() first.");
  return virtualFS;
}

const toVFSPath = toRelativePath;

/** Pre-fetch any lazy (not-yet-downloaded) S3 files referenced in the code. */
async function ensureReferencedFilesReady(code: string): Promise<void> {
  if (!virtualFS) return;

  const lazyPaths = virtualFS.getLazyFilePaths();
  if (lazyPaths.length === 0) return;

  const toFetch: string[] = [];
  for (const fullPath of lazyPaths) {
    if (code.includes(fullPath)) {
      toFetch.push(fullPath);
    }
  }

  if (toFetch.length === 0) return;

  console.log(LOG_PREFIX, `Pre-fetching ${toFetch.length} lazy file(s) referenced in code...`);
  for (const fullPath of toFetch) {
    const vfsPath = fullPath.slice(STORAGE_MOUNT_PATH.length + 1);
    try {
      await virtualFS.ensureFileReady(vfsPath);
    } catch (e) {
      console.warn(LOG_PREFIX, `Failed to pre-fetch ${fullPath}:`, e);
    }
  }
  console.log(LOG_PREFIX, `Pre-fetch complete`);
}

async function runPython(code: string): Promise<PyodideExecutionResult> {
  const outputLines: string[] = [];
  const errorLines: string[] = [];

  try {
    await initDuckDB();

    await resumeHandlesIfNeeded();
    await ensureReferencedFilesReady(code);

    const instance = pyodide!;

    instance.setStdout({
      batched: (msg: string) => outputLines.push(msg),
    });

    instance.setStderr({
      batched: (msg: string) => errorLines.push(msg),
    });

    await instance.loadPackagesFromImports(code);

    const result = await instance.runPythonAsync(code);

    const output = outputLines.join("\n");
    const error = errorLines.length > 0 ? errorLines.join("\n") : undefined;

    let tableData: PyodideExecutionResult["tableData"] = undefined;
    let imageData: PyodideExecutionResult["imageData"] = undefined;
    const resultStr = result !== undefined && result !== null ? String(result) : "";
    const isDataFrameStr =
      resultStr.includes("[") && resultStr.includes("rows x") && resultStr.includes("columns]");

    if (typeof result === "string" && result.length > 100 && result.startsWith("iVBOR")) {
      imageData = result;
    }

    if (!imageData) {
      try {
        const figCheck = await instance.runPythonAsync(`
_fig_base64_result = None
try:
    if plt.get_fignums():
        _fig_base64_result = _capture_figure()
except Exception as e:
    pass
_fig_base64_result
`);
        if (
          figCheck &&
          typeof figCheck === "string" &&
          figCheck !== "None" &&
          figCheck.startsWith("iVBOR")
        ) {
          imageData = figCheck;
        }
      } catch {
        // Ignore errors when checking for figures
      }
    }

    let totalRows: number | undefined = undefined;

    if (result !== undefined && result !== null && (isDataFrameStr || resultStr === "")) {
      // Pass the result back to Python for reliable type checking
      // (Python's `_` variable is only set by the interactive REPL, not by runPythonAsync)
      (instance as any).globals.set("_last_expr_result", result);
      const dfCheck = await instance.runPythonAsync(`
import json
_df_json = None
try:
    if isinstance(_last_expr_result, pd.DataFrame):
        _df = _last_expr_result
        _MAX_ROWS = 500
        _total_rows = len(_df)
        if _total_rows > _MAX_ROWS:
            _df = _df.head(_MAX_ROWS)
        def _convert_val(v):
            if v is None or (isinstance(v, float) and v != v):
                return None
            if isinstance(v, (int, float, bool, str)):
                return v
            return str(v)
        _rows = [
            {col: _convert_val(row[i]) for i, col in enumerate(_df.columns)}
            for row in _df.values.tolist()
        ]
        _df_json = json.dumps({"rows": _rows, "totalRows": _total_rows})
except:
    pass
_df_json
`);
      if (dfCheck && typeof dfCheck === "string" && dfCheck !== "None") {
        try {
          const parsed = JSON.parse(dfCheck);
          if (parsed && Array.isArray(parsed.rows)) {
            tableData = parsed.rows;
            totalRows = typeof parsed.totalRows === "number" ? parsed.totalRows : undefined;
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    }

    let formattedResult = output;

    if (!tableData && !imageData && result !== undefined && result !== null) {
      if (resultStr !== "undefined" && resultStr !== "None") {
        formattedResult = formattedResult ? `${formattedResult}${resultStr}` : resultStr;
      }
    }

    return {
      output: tableData ? "" : formattedResult || (error ? "" : ""),
      error,
      tableData,
      totalRows,
      imageData,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      output: outputLines.join("\n"),
      error: errorMessage,
    };
  }
}

async function runSQL(sql: string, viewName?: string): Promise<PyodideExecutionResult> {
  console.log(LOG_PREFIX, `runSQL called with: ${sql.substring(0, 200)}...`);
  const outputLines: string[] = [];
  const errorLines: string[] = [];

  try {
    await initDuckDB();

    await resumeHandlesIfNeeded();
    await ensureReferencedFilesReady(sql);

    const instance = pyodide!;

    instance.setStdout({
      batched: (msg: string) => outputLines.push(msg),
    });

    instance.setStderr({
      batched: (msg: string) => errorLines.push(msg),
    });

    const escapedSQL = sql.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
    const viewNamePython = viewName ? `"${viewName}"` : "None";

    const result = await instance.runPythonAsync(`
import json

_sql_query = """${escapedSQL}"""
_view_name = ${viewNamePython}

if _view_name:
    _duckdb_conn.execute(f"CREATE OR REPLACE VIEW {_view_name} AS {_sql_query}")
    exec(f"{_view_name} = _duckdb_conn.execute('SELECT * FROM {_view_name}').df()", globals())

_MAX_ROWS = 500
_count_result = _duckdb_conn.execute(f"SELECT COUNT(*) FROM ({_sql_query})")
_total_rows = _count_result.fetchone()[0]
_sql_result = _duckdb_conn.execute(f"SELECT * FROM ({_sql_query}) LIMIT {_MAX_ROWS}")
_sql_output = _sql_result.fetchall()
_sql_columns = [desc[0] for desc in _sql_result.description] if _sql_result.description else []

def _convert_value(v):
    if v is None:
        return None
    if isinstance(v, (int, float, bool, str)):
        return v
    return str(v)

_json_result = None
if _sql_columns and _sql_output:
    _rows = [
        {col: _convert_value(row[i]) for i, col in enumerate(_sql_columns)}
        for row in _sql_output
    ]
    _json_result = json.dumps({"rows": _rows, "totalRows": _total_rows})
elif _sql_output:
    _rows = [
        {f"col{i}": _convert_value(cell) for i, cell in enumerate(row)}
        for row in _sql_output
    ]
    _json_result = json.dumps({"rows": _rows, "totalRows": _total_rows})

_json_result
`);

    const output = outputLines.join("\n");
    const error = errorLines.length > 0 ? errorLines.join("\n") : undefined;

    let tableData: PyodideExecutionResult["tableData"] = undefined;
    let totalRows: number | undefined = undefined;
    const resultStr = result !== null && result !== undefined ? String(result) : null;

    if (resultStr && resultStr !== "None" && resultStr !== "undefined") {
      try {
        const parsed = JSON.parse(resultStr);
        if (Array.isArray(parsed)) {
          tableData = parsed;
        } else if (parsed && Array.isArray(parsed.rows)) {
          tableData = parsed.rows;
          totalRows = typeof parsed.totalRows === "number" ? parsed.totalRows : undefined;
        }
      } catch {
        // Not JSON, that's fine
      }
    }

    return {
      output: tableData ? "" : output || "Query executed successfully",
      error,
      tableData,
      totalRows,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      output: outputLines.join("\n"),
      error: extractSQLError(errorMessage),
    };
  }
}

async function getTables(): Promise<TableInfo[]> {
  if (!isDuckDBReady) return [];

  try {
    await initDuckDB();
    const instance = pyodide!;

    const result = await instance.runPythonAsync(`
import json
_tables = _duckdb_conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'").fetchall()
_table_info = []
for (_table_name,) in _tables:
    _cols = _duckdb_conn.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{_table_name}'").fetchall()
    _table_info.append({
        "name": _table_name,
        "columns": [{"name": c[0], "type": c[1]} for c in _cols]
    })
json.dumps(_table_info)
`);

    if (result && typeof result === "string") {
      return JSON.parse(result) as TableInfo[];
    }
    return [];
  } catch {
    return [];
  }
}

async function getFunctions(): Promise<RegisteredFunction[]> {
  if (!isDuckDBReady) return [];

  try {
    await initDuckDB();
    const instance = pyodide!;

    const result = await instance.runPythonAsync(`
import json
json.dumps(list(_registered_udfs.values()))
`);

    if (result && typeof result === "string") {
      return JSON.parse(result) as RegisteredFunction[];
    }
    return [];
  } catch {
    return [];
  }
}

async function getVariables(): Promise<PythonVariable[]> {
  if (!isDuckDBReady) return [];

  try {
    await initDuckDB();
    const instance = pyodide!;

    const result = await instance.runPythonAsync(`
import json

def _get_variables():
    _skip_types = {'module', 'function', 'type', 'builtin_function_or_method'}
    _vars = []
    for name, value in globals().items():
        if name.startswith('_'):
            continue
        _type_name = type(value).__name__
        if _type_name in _skip_types:
            continue

        _size = None
        if hasattr(value, 'shape'):
            _size = str(value.shape)
        elif hasattr(value, '__len__') and _type_name not in {'str'}:
            try:
                _size = f"len={len(value)}"
            except:
                pass

        try:
            _repr = repr(value)
            if len(_repr) > 80:
                _repr = _repr[:77] + '...'
        except:
            _repr = f"<{_type_name}>"

        _vars.append({
            "name": name,
            "type": _type_name,
            "value": _repr,
            "size": _size
        })
    return sorted(_vars, key=lambda x: x["name"])

json.dumps(_get_variables())
`);

    if (result && typeof result === "string") {
      return JSON.parse(result) as PythonVariable[];
    }
    return [];
  } catch {
    return [];
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "init": {
        try {
          await initDuckDB();
          await initLocalStorage();
          // Set working directory to /mnt/local so relative paths (e.g. "sales.csv")
          // resolve to /mnt/local/sales.csv in DuckDB and Python.
          pyodide!.FS.chdir(`${STORAGE_MOUNT_PATH}/${LOCAL_STORAGE_SUBPATH}`);
          postResponse({ type: "init", id: request.id, success: true });
          scheduleHandleSuspend();
        } catch (err) {
          postResponse({
            type: "init",
            id: request.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "runPython": {
        activeExecutions++;
        try {
          const result = await runPython(request.code);
          postResponse({ type: "runPython", id: request.id, result });
        } finally {
          activeExecutions--;
          scheduleHandleSuspend();
        }
        break;
      }

      case "runSQL": {
        activeExecutions++;
        try {
          const result = await runSQL(request.sql, request.viewName);
          postResponse({ type: "runSQL", id: request.id, result });
        } finally {
          activeExecutions--;
          scheduleHandleSuspend();
        }
        break;
      }

      case "getTables": {
        const tables = await getTables();
        postResponse({ type: "getTables", id: request.id, tables });
        break;
      }

      case "getFunctions": {
        const functions = await getFunctions();
        postResponse({ type: "getFunctions", id: request.id, functions });
        break;
      }

      case "getVariables": {
        const variables = await getVariables();
        postResponse({ type: "getVariables", id: request.id, variables });
        break;
      }

      case "listFiles": {
        const vfs = getVFS();
        const files = await vfs.listAllFiles();
        const filesWithFullPaths = files.map(f => ({
          ...f,
          path: `${STORAGE_MOUNT_PATH}/${f.path}`,
        }));
        postResponse({ type: "listFiles", id: request.id, files: filesWithFullPaths });
        break;
      }

      case "writeFile": {
        try {
          const vfs = getVFS();
          const vfsPath = toVFSPath(request.name);
          await vfs.writeFile(vfsPath, request.data);
          const fullPath = `${STORAGE_MOUNT_PATH}/${vfsPath}`;
          postResponse({ type: "writeFile", id: request.id, success: true, path: fullPath });
          scheduleHandleSuspend();
        } catch (err) {
          postResponse({
            type: "writeFile",
            id: request.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "readFile": {
        try {
          const vfs = getVFS();
          const vfsPath = toVFSPath(request.name);
          const data = await vfs.readFile(vfsPath);
          postResponse({ type: "readFile", id: request.id, data: data.buffer as ArrayBuffer });
        } catch (err) {
          console.error(LOG_PREFIX, `readFile failed:`, err);
          postResponse({
            type: "error",
            id: request.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "deleteFile": {
        const vfs = getVFS();
        const vfsPath = toVFSPath(request.name);
        const success = await vfs.deleteFile(vfsPath);
        postResponse({ type: "deleteFile", id: request.id, success });
        break;
      }

      case "fileExists": {
        const vfs = getVFS();
        const vfsPath = toVFSPath(request.name);
        const exists = await vfs.fileExists(vfsPath);
        postResponse({ type: "fileExists", id: request.id, exists });
        break;
      }

      case "createDirectory": {
        try {
          const vfs = getVFS();
          const vfsPath = toVFSPath(request.path);
          await vfs.createDirectory(vfsPath);
          postResponse({ type: "createDirectory", id: request.id, success: true });
        } catch (err) {
          postResponse({
            type: "error",
            id: request.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "deleteDirectory": {
        const vfs = getVFS();
        const vfsPath = toVFSPath(request.path);
        const success = await vfs.deleteDirectory(vfsPath);
        postResponse({ type: "deleteDirectory", id: request.id, success });
        break;
      }

      case "renameDirectory": {
        try {
          const vfs = getVFS();
          const vfsPath = toVFSPath(request.oldPath);
          await vfs.renameDirectory(vfsPath, request.newName);
          postResponse({ type: "renameDirectory", id: request.id, success: true });
          scheduleHandleSuspend();
        } catch (err) {
          postResponse({
            type: "error",
            id: request.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "moveFile": {
        try {
          const vfs = getVFS();
          const sourcePath = toVFSPath(request.sourcePath);
          const targetDir = toVFSPath(request.targetDir);
          const newPath = await vfs.moveFile(sourcePath, targetDir);
          postResponse({ type: "moveFile", id: request.id, success: true, newPath });
          scheduleHandleSuspend();
        } catch (err) {
          postResponse({
            type: "moveFile",
            id: request.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "renameFile": {
        try {
          const vfs = getVFS();
          const vfsPath = toVFSPath(request.path);
          const newPath = await vfs.renameFile(vfsPath, request.newName);
          postResponse({ type: "renameFile", id: request.id, success: true, newPath });
          scheduleHandleSuspend();
        } catch (err) {
          postResponse({
            type: "renameFile",
            id: request.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "convertFile": {
        activeExecutions++;
        try {
          await initDuckDB();
          await resumeHandlesIfNeeded();

          const instance = pyodide!;
          const filePath = request.filePath;
          const targetFormat = request.targetFormat;

          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          let readExpr: string;
          switch (ext) {
            case "csv":     readExpr = `read_csv('${filePath}')`; break;
            case "parquet": readExpr = `read_parquet('${filePath}')`; break;
            case "xlsx":
            case "xls":     readExpr = `st_read('${filePath}')`; break;
            default:
              throw new Error(`Unsupported source file type: .${ext}`);
          }

          let data: Uint8Array;

          if (targetFormat === "xlsx") {
            const jsonResult = await instance.runPythonAsync(`
import json
_rows = _duckdb_conn.execute("SELECT * FROM ${readExpr}").fetchdf().to_dict(orient='records')
json.dumps(_rows, default=str)
`);
            const jsonStr = String(jsonResult);
            instance.FS.writeFile("/tmp/_export_data.json", jsonStr);
            await instance.runPythonAsync(`
import json
from openpyxl import Workbook

with open('/tmp/_export_data.json', 'r') as f:
    _data = json.load(f)

_wb = Workbook()
_ws = _wb.active
if _data:
    _ws.append(list(_data[0].keys()))
    for _row in _data:
        _ws.append(list(_row.values()))
_wb.save('/tmp/_export.xlsx')
`);
            data = instance.FS.readFile("/tmp/_export.xlsx") as Uint8Array;
            try { instance.FS.unlink("/tmp/_export_data.json"); } catch { /* ok */ }
            try { instance.FS.unlink("/tmp/_export.xlsx"); } catch { /* ok */ }
          } else {
            let copyOpts: string;
            let tmpFile: string;
            switch (targetFormat) {
              case "csv":
                copyOpts = "FORMAT CSV, HEADER";
                tmpFile = "/tmp/_export.csv";
                break;
              case "json":
                copyOpts = "FORMAT JSON, ARRAY true";
                tmpFile = "/tmp/_export.json";
                break;
              case "parquet":
                copyOpts = "FORMAT PARQUET";
                tmpFile = "/tmp/_export.parquet";
                break;
              default:
                throw new Error(`Unsupported target format: ${targetFormat}`);
            }

            await instance.runPythonAsync(
              `_duckdb_conn.execute("COPY (SELECT * FROM ${readExpr}) TO '${tmpFile}' (${copyOpts})")`
            );
            data = instance.FS.readFile(tmpFile) as Uint8Array;
            try { instance.FS.unlink(tmpFile); } catch { /* ok */ }
          }

          const buffer = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ) as ArrayBuffer;

          postResponse(
            { type: "convertFile", id: request.id, data: buffer } as WorkerResponse,
          );
        } catch (err) {
          postResponse({
            type: "error",
            id: request.id,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          activeExecutions--;
          scheduleHandleSuspend();
        }
        break;
      }
    }
  } catch (err) {
    postResponse({
      type: "error",
      id: request.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
