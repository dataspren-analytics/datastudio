/**
 * Data Studio Module
 *
 * Provides the complete data studio experience:
 * - Runtime execution (Python/SQL via Pyodide/DuckDB)
 * - Persistent storage (OPFS - notebooks and data files stored together)
 * - React components for notebook cells and layout
 *
 * ## Quick Start
 *
 * ```tsx
 * import { DataStudioView, DataStudioProvider, PyodideExecutionBackend } from "@/data-studio";
 *
 * function App() {
 *   const config = { execution: new PyodideExecutionBackend() };
 *   return (
 *     <DataStudioProvider config={config}>
 *       <DataStudioView />
 *     </DataStudioProvider>
 *   );
 * }
 * ```
 */

// Provider & View
export { DataStudioProvider } from "./provider/data-studio-provider";
export type { NotebookProviderConfig } from "./provider/data-studio-provider";
export { DataStudioView } from "./data-studio-view";

// Runtime
export { PyodideExecutionBackend } from "./runtime";

// Utilities
export { generateId } from "./notebook/utils";
export { createCodeCell } from "./runtime";

// Types needed for configuration
export type { NotebookCell } from "./runtime";
