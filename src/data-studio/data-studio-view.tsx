"use client";

import { useAppStore, selectShowHome } from "./store";

import { ContentArea } from "./data-studio-content-area";
import { DataStudioHeader } from "./data-studio-header";
import { DataStudioLayout } from "./data-studio-layout";
import { FileSidebar } from "./file-explorer";
import { HomePage } from "./data-studio-home-page";

export function DataStudioView() {
  const showHome = useAppStore(selectShowHome);

  return (
    <div className="[&_button]:cursor-pointer min-h-svh">
      <DataStudioLayout
        header={<DataStudioHeader />}
        fileExplorer={<FileSidebar />}
        content={showHome ? <HomePage /> : <ContentArea />}
      />
    </div>
  );
}
