import { useEffect, useState } from "react";
import type { ViewerLoadingState } from "../types";

/**
 * Shared hook for loading file content.
 * Handles the read → transform → state lifecycle with cancellation.
 */
export function useFileLoader<T extends Record<string, unknown>>(
  filePath: string,
  loadFn: (data: Uint8Array, filePath: string) => T,
  readFile: (path: string) => Promise<Uint8Array>,
): ViewerLoadingState<T> {
  const [state, setState] = useState<ViewerLoadingState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    readFile(filePath)
      .then((data) => {
        if (cancelled) return;
        const result = loadFn(data, filePath);
        setState({ status: "success", ...result } as ViewerLoadingState<T>);
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Failed to load file",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, readFile, loadFn]);

  return state;
}
