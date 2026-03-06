import { useEffect, useState } from "react";
import type { ExecutionStatus, FileInfo, IExecutionBackend } from "../../runtime";

/**
 * Subscribe to execution backend status and file change events.
 */
export function useExecutionStatus(execution: IExecutionBackend) {
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>(
    () => execution.status,
  );
  const [dataFiles, setDataFiles] = useState<FileInfo[]>([]);

  useEffect(() => {
    const unsub = execution.onChange((event) => {
      switch (event.type) {
        case "status":
          setExecutionStatus(event.data);
          break;
        case "files":
          setDataFiles(event.data);
          break;
      }
    });
    return unsub;
  }, [execution]);

  return { executionStatus, dataFiles, setDataFiles };
}
