import type { RuntimeContextValue } from "../provider/runtime-provider";

export interface FileViewerProps {
  filePath: string;
  runtime: RuntimeContextValue;
}

export type ViewerLoadingState<T = void> =
  | { status: "loading" }
  | { status: "success" } & (T extends void ? object : T)
  | { status: "error"; message: string };
