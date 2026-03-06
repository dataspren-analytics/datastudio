import { useEffect, useRef } from "react";
import type { IExecutionBackend } from "../../runtime";

/**
 * Auto-initialize the execution backend on mount, with StrictMode-safe
 * delayed disposal on unmount.
 */
export function useAutoInit(execution: IExecutionBackend, enabled: boolean) {
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (enabled && !initStartedRef.current) {
      initStartedRef.current = true;
      console.log("[RuntimeProvider] Initializing execution backend...");
      execution.init();
    }
  }, [enabled, execution]);

  const disposeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (disposeTimeoutRef.current) {
      console.log("[RuntimeProvider] Cancelling pending disposal (StrictMode remount)");
      clearTimeout(disposeTimeoutRef.current);
      disposeTimeoutRef.current = null;
    }
    return () => {
      disposeTimeoutRef.current = setTimeout(() => {
        console.log("[RuntimeProvider] Disposing execution backend (delayed cleanup)");
        execution.dispose();
        disposeTimeoutRef.current = null;
      }, 100);
    };
  }, [execution]);
}
