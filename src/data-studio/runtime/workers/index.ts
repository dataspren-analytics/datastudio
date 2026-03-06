// Virtual filesystem (mounts multiple devices)
export type { IVirtualFSDevice } from "./virtual-fs-device";
export { createVirtualFSDevice } from "./virtual-fs-device";

// OPFS device implementation
export { createOPFSDevice } from "./opfs-device";

// Worker protocol types
export type {
  PyodideExecutionResult,
  PythonVariable,
  RegisteredFunction,
  TableColumn,
  TableInfo,
  WorkerRequest,
  WorkerResponse,
} from "./pyodide.worker.types";
