"use client";

import {
  createCodeCell,
  PyodideExecutionBackend,
  DataStudioProvider,
  DataStudioView,
} from "@/data-studio";
import { useMemo } from "react";


export default function Page() {
  const config = useMemo(() => ({
    execution: new PyodideExecutionBackend(),
    initialCells: [createCodeCell()],
  }), []);

  return (
    <DataStudioProvider config={config}>
        <DataStudioView />
    </DataStudioProvider>
  );
}
