"use client";

import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CREATABLE_FILE_TYPES } from "../lib/file-types";
import { ChevronLeft, Home, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { ResizablePanel } from "../components/resizable-panel";
import { useRuntime } from "../provider/runtime-provider";
import {
  useAppStore,
  selectActiveFilePath,
  selectShowHome,
  selectSidebarCollapsed,
  selectSetSidebarCollapsed,
  selectExpandedPaths,
  selectTogglePath,
  selectSelectFile,
  selectSetShowHome,
  selectSidebarWidth,
  selectSetSidebarWidth,
  selectExpandPath,
} from "../store";

import type { FileTreeNode } from "./lib/types";
import { buildFileTree } from "./lib/file-tree-utils";
import { MOUNT_ROOT } from "../lib/paths";
import { useFileSelection } from "./hooks/use-file-selection";
import { useFileRename } from "./hooks/use-file-rename";
import { useFileContextMenu } from "./hooks/use-file-context-menu";
import { useFileDnd } from "./hooks/use-file-dnd";
import { useFileOperations } from "./hooks/use-file-operations";
import { useExternalDrop } from "./hooks/use-external-drop";
import { CollapsedSidebar } from "./components/collapsed-sidebar";
import { DragOverlayItem } from "./components/drag-overlay-item";
import { FileSidebarDialogs } from "./components/file-sidebar-dialogs";
import { FileTreeContextMenuContent } from "./components/file-context-menu";
import { FileTreeNodeComponent } from "./components/file-tree-node";

export function FileSidebar() {
  const runtime = useRuntime();
  const { dataFiles } = runtime;
  const activeFilePath = useAppStore(selectActiveFilePath);
  const showHome = useAppStore(selectShowHome);
  const collapsed = useAppStore(selectSidebarCollapsed);
  const setCollapsed = useAppStore(selectSetSidebarCollapsed);
  const expandedPathsArr = useAppStore(selectExpandedPaths, shallow);
  const togglePath = useAppStore(selectTogglePath);
  const selectFile = useAppStore(selectSelectFile);
  const setShowHome = useAppStore(selectSetShowHome);
  const sidebarWidth = useAppStore(selectSidebarWidth);
  const setSidebarWidth = useAppStore(selectSetSidebarWidth);
  const expandPath = useAppStore(selectExpandPath);

  const expandedPaths = useMemo(() => new Set(expandedPathsArr), [expandedPathsArr]);

  const notebooks = useMemo(() =>
    dataFiles
      .filter((f) => !f.isDirectory && f.path.endsWith(".ipynb"))
      .slice(0, 5)
      .map((f) => ({ filePath: f.path, name: f.name.replace(".ipynb", "") })),
    [dataFiles],
  );

  const fileTree = useMemo(() => buildFileTree(dataFiles), [dataFiles]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, FileTreeNode>();
    function traverse(node: FileTreeNode) {
      map.set(node.path, node);
      if (node.children) node.children.forEach(traverse);
    }
    traverse(fileTree);
    return map;
  }, [fileTree]);

  const flatVisibleNodes = useMemo(() => {
    const result: string[] = [];
    function walk(node: FileTreeNode) {
      if (node.path !== MOUNT_ROOT) result.push(node.path);
      if (node.isDirectory && node.children && expandedPaths.has(node.path))
        for (const child of node.children) walk(child);
    }
    walk(fileTree);
    return result;
  }, [fileTree, expandedPaths]);

  const selection = useFileSelection(flatVisibleNodes, selectFile, togglePath);
  const rename = useFileRename(nodeMap, runtime, selection.clearSelection);
  const dnd = useFileDnd(nodeMap, runtime, expandPath, selection.clearSelection);
  const ops = useFileOperations(runtime, nodeMap, selectFile, selection.clearSelection, expandPath);
  const externalDrop = useExternalDrop(runtime);
  const ctxMenu = useFileContextMenu(selection.selectedPaths, selection.clearSelection);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selection.selectedPaths.size === 0) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        ops.handleBulkDelete(selection.selectedPaths);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection.selectedPaths, ops.handleBulkDelete]);

  if (collapsed) {
    return (
      <CollapsedSidebar
        showHome={showHome}
        activeFilePath={activeFilePath}
        notebooks={notebooks}
        onExpand={() => setCollapsed(false)}
        onShowHome={() => setShowHome(true)}
        onSelectFile={selectFile}
      />
    );
  }

  return (
    <ResizablePanel
      direction="horizontal"
      size={sidebarWidth}
      onSizeChange={setSidebarWidth}
      minSize={140}
      maxSize={600}
      contentRef={externalDrop.sidebarRef}
      contentClassName={cn(
        "border-r border-neutral-200 dark:border-sidebar-border bg-neutral-50/30 dark:bg-sidebar flex flex-col select-none",
        externalDrop.isSidebarDragOver && "ring-2 ring-inset ring-blue-400/50"
      )}
    >
      <button
        onClick={() => setShowHome(true)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-xs transition-colors border-b border-neutral-200/50 dark:border-neutral-800/50",
          showHome
            ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-sidebar-accent"
            : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-sidebar-accent/50",
        )}
      >
        <Home size={14} />
        <span className="font-medium">Home</span>
      </button>

      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-200/50 dark:border-neutral-800/50">
        <span className="font-mono text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
                title="New file"
              >
                <Plus size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 min-w-0">
              {CREATABLE_FILE_TYPES.map((ft, i) => {
                const Icon = ft.icon;
                return (
                  <Fragment key={ft.extension}>
                    {i === 1 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => ops.handleCreateFile(ft.extension)} className="text-xs py-1.5">
                      <Icon size={12} />
                      <span>{ft.label}</span>
                    </DropdownMenuItem>
                  </Fragment>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      <DndContext
        id="file-sidebar-dnd"
        sensors={dnd.sensors}
        collisionDetection={pointerWithin}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        onDragMove={dnd.handleDragMove}
      >
        <ScrollArea className="flex-1 min-h-0">
          <div className="py-1" onClick={selection.clearSelection}>
            <FileTreeNodeComponent
              node={fileTree}
              depth={0}
              expandedPaths={expandedPaths}
              onDeleteFile={runtime.deleteFile}
              onCopyPath={ops.handleCopyPath}
              activeNotebookPath={showHome ? null : activeFilePath}
              onDuplicateFile={ops.handleDuplicateFile}
              onDownloadFile={ops.handleDownloadFile}
              onExportFile={ops.handleExportFile}
              editingPath={rename.editingPath}
              editingName={rename.editingName}
              setEditingName={rename.setEditingName}
              editInputRef={rename.editInputRef}
              onStartRename={rename.handleStartRename}
              onFinishRename={rename.handleFinishRename}
              onCancelRename={rename.handleCancelRename}
              onCreateDirectory={ops.handleCreateDirectory}
              onDeleteDirectory={ops.handleDeleteDirectory}
              dropTargetDir={dnd.dropTargetDir}
              isDragging={!!dnd.draggedNode}
              externalDropTargetDir={externalDrop.externalDropTargetDir}
              transferring={dnd.transferring}
              onNodeContextMenu={ctxMenu.handleNodeContextMenu}
              selectedPaths={selection.selectedPaths}
              onNodeSelect={selection.handleNodeSelect}
              pendingNewFile={ops.pendingNewFile}
              newFileName={ops.newFileName}
              setNewFileName={ops.setNewFileName}
              newFileInputRef={ops.newFileInputRef}
              newFileError={ops.newFileError}
              onCommitNewFile={ops.commitNewFile}
              onCancelNewFile={ops.handleCancelNewFile}
            />
          </div>
        </ScrollArea>

        {ctxMenu.contextMenu && (
          <DropdownMenu key={ctxMenu.contextMenu.key} open modal={false} onOpenChange={(open) => !open && ctxMenu.setContextMenu(null)}>
            <DropdownMenuTrigger asChild>
              <div className="fixed" style={{ left: ctxMenu.contextMenu.x, top: ctxMenu.contextMenu.y, width: 0, height: 0 }} />
            </DropdownMenuTrigger>
            <FileTreeContextMenuContent
              node={ctxMenu.contextMenu.node}
              onCreateDirectory={ops.handleCreateDirectory}
              onStartRename={rename.handleStartRename}
              onDeleteDirectory={ops.handleDeleteDirectory}
              onDuplicateFile={ops.handleDuplicateFile}
              onDownloadFile={ops.handleDownloadFile}
              onExportFile={ops.handleExportFile}
              onCopyPath={ops.handleCopyPath}
              onDeleteFile={runtime.deleteFile}
              selectedPaths={ctxMenu.contextMenu.selectedPaths}
              onBulkDelete={ops.handleBulkDelete}
              onBulkDownload={ops.handleBulkDownload}
            />
          </DropdownMenu>
        )}
        <DragOverlay dropAnimation={null}>
          {dnd.draggedNode && <DragOverlayItem node={dnd.draggedNode} />}
        </DragOverlay>
      </DndContext>

      <FileSidebarDialogs
        pendingMove={dnd.pendingMove}
        onConfirmMove={dnd.handleConfirmMove}
        onCancelMove={dnd.handleCancelMove}
        createDirParent={ops.createDirParent}
        createDirName={ops.createDirName}
        createDirInputRef={ops.createDirInputRef}
        onCreateDirNameChange={ops.setCreateDirName}
        onConfirmCreateDir={ops.handleConfirmCreateDirectory}
        onCancelCreateDir={() => { ops.setCreateDirParent(null); ops.setCreateDirName(""); }}
        pendingDelete={ops.pendingDelete}
        onConfirmDelete={ops.handleConfirmDelete}
        onConfirmBulkDelete={ops.handleConfirmBulkDelete}
        onCancelDelete={() => ops.setPendingDelete(null)}
      />
    </ResizablePanel>
  );
}
