import { Fragment, useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2 } from "lucide-react";
import type { FileTreeNode, DropTargetDir, TransferState, PendingNewFile } from "../lib/types";
import { FileIconForName, formatFileSize } from "../lib/file-tree-utils";
import { getFileType } from "../../lib/file-types";

export interface FileTreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onDeleteFile: (path: string) => Promise<boolean>;
  onCopyPath: (path: string) => void;
  activeNotebookPath: string | null;
  onDuplicateFile: (path: string) => Promise<void>;
  onDownloadFile: (name: string) => Promise<void>;
  onExportFile: (path: string, format: string) => Promise<void>;
  editingPath: string | null;
  editingName: string;
  setEditingName: (name: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onStartRename: (path: string, currentName: string) => void;
  onFinishRename: () => void;
  onCancelRename: () => void;
  onCreateDirectory: (parentPath: string) => void;
  onDeleteDirectory: (path: string) => void;
  dropTargetDir: DropTargetDir;
  isDragging: boolean;
  externalDropTargetDir: string | null;
  transferring: TransferState | null;
  onNodeContextMenu: (node: FileTreeNode, x: number, y: number) => void;
  selectedPaths: Set<string>;
  onNodeSelect: (path: string, isDirectory: boolean, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  // Inline new file creation
  pendingNewFile: PendingNewFile | null;
  newFileName: string;
  setNewFileName: (name: string) => void;
  newFileInputRef: React.RefObject<HTMLInputElement | null>;
  newFileError: string | null;
  onCommitNewFile: (parentDir: string, name: string) => void;
  onCancelNewFile: () => void;
}

export function FileTreeNodeComponent({
  node,
  depth,
  expandedPaths,
  onDeleteFile,
  onCopyPath,
  activeNotebookPath,
  onDuplicateFile,
  onDownloadFile,
  onExportFile,
  editingPath,
  editingName,
  setEditingName,
  editInputRef,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onCreateDirectory,
  onDeleteDirectory,
  dropTargetDir,
  isDragging,
  externalDropTargetDir,
  transferring,
  onNodeContextMenu,
  selectedPaths,
  onNodeSelect,
  pendingNewFile,
  newFileName,
  setNewFileName,
  newFileInputRef,
  newFileError,
  onCommitNewFile,
  onCancelNewFile,
}: FileTreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isActiveFile = !node.isDirectory && node.path === activeNotebookPath;
  const isEditing = node.path === editingPath;
  const isBeingTransferred = transferring?.sourcePath === node.path;

  const canDrag = !node.isDirectory;

  const draggableId = `drag:${node.path}`;
  const droppableId = `drop:${node.path}`;

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging: isThisDragging,
  } = useDraggable({
    id: draggableId,
    disabled: !canDrag,
    data: { node },
  });

  const {
    setNodeRef: setDropRef,
  } = useDroppable({
    id: droppableId,
    disabled: false,
    data: { node },
  });

  const setNodeRef = useCallback((el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  }, [setDragRef, setDropRef]);

  const isDropOnTarget = node.isDirectory && dropTargetDir === node.path && isDragging;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeSelect(node.path, node.isDirectory, { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
  }, [node.isDirectory, node.path, onNodeSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu(node, e.clientX, e.clientY);
  }, [node, onNodeContextMenu]);

  const isExternalDropTarget = node.isDirectory && externalDropTargetDir === node.path;
  const showDragHighlight = isDropOnTarget || isExternalDropTarget;

  return (
    <div
      className={cn(
        "transition-colors",
        showDragHighlight && "bg-neutral-500/10 dark:bg-neutral-300/5",
      )}
      {...(node.isDirectory ? { "data-dir-path": node.path } : {})}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1 pr-1 py-0.5 text-xs transition-colors select-none min-w-0",
          "hover:bg-neutral-100 dark:hover:bg-accent",
          isActiveFile && "bg-neutral-100 dark:bg-sidebar-accent",
          selectedPaths.has(node.path) && !isActiveFile && "bg-blue-50 dark:bg-blue-900/20",
          isThisDragging && "opacity-30",
          isBeingTransferred && "opacity-0 h-0 py-0 overflow-hidden",
          canDrag && "touch-none"
        )}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
        onContextMenu={handleContextMenu}
        {...dragListeners}
        {...dragAttributes}
        onClick={handleClick}
      >
        {node.isDirectory && (
          <ChevronRight
            size={12}
            className={cn(
              "text-neutral-400 shrink-0",
              isExpanded && "rotate-90"
            )}
          />
        )}

        {!node.isDirectory && <FileIconForName name={node.name} size={12} className={cn(
            "shrink-0",
            isActiveFile ? "text-brand" : "text-neutral-500"
          )} />}

        {isEditing ? (
          <Input
            ref={editInputRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={onFinishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 px-1 py-0 text-xs border-0 bg-white dark:bg-muted focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-ring flex-1"
          />
        ) : (
          <span className={cn(
            "font-medium truncate flex-1 text-xs",
            "text-neutral-700 dark:text-neutral-300",
            isActiveFile && "text-neutral-950 dark:text-neutral-100"
          )}>
            {node.name}
          </span>
        )}

        {!node.isDirectory && getFileType(node.name).showSize && node.size !== undefined && (
          <span className="text-neutral-400 dark:text-neutral-500 text-[9px] shrink-0 mr-0.5">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && (() => {
        const showNewFile = pendingNewFile && pendingNewFile.parentDir === node.path;
        const showGhost = transferring && transferring.targetDir === node.path;
        let ghostIndex = node.children.length;
        if (showGhost) {
          const ghostPriority = getFileType(transferring.fileName).sortPriority;
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (child.isDirectory) continue;
            const childPriority = getFileType(child.name).sortPriority;
            if (childPriority < ghostPriority) continue;
            if (childPriority > ghostPriority) { ghostIndex = i; break; }
            if (transferring.fileName.localeCompare(child.name) <= 0) { ghostIndex = i; break; }
          }
        }

        const newFileElement = showNewFile ? (
          <div key="__new_file">
            <div
              className="flex items-center gap-1 pr-1 py-0.5 text-xs select-none min-w-0 bg-neutral-100 dark:bg-sidebar-accent"
              style={{ paddingLeft: `${(depth + 1) * 10 + 4}px` }}
            >
              <FileIconForName name={newFileName || pendingNewFile.defaultName} size={12} className="shrink-0 text-neutral-500" />
              <input
                ref={newFileInputRef}
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitNewFile(pendingNewFile.parentDir, e.currentTarget.value);
                  }
                  if (e.key === "Escape") onCancelNewFile();
                }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "h-5 flex-1 min-w-0 px-1 py-0 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-muted border outline-none",
                  newFileError
                    ? "border-red-500 dark:border-red-400"
                    : "border-blue-500 dark:border-blue-400",
                )}
              />
            </div>
            {newFileError && (
              <div
                className="mx-1 mt-0.5 mb-1 px-1.5 py-1 text-[10px] leading-tight text-red-100 bg-red-600/90 dark:bg-red-500/90 border border-red-500 dark:border-red-400"
                style={{ marginLeft: `${(depth + 1) * 10 + 4}px` }}
              >
                A file or folder <strong>{newFileName.trim()}</strong> already exists at this location. Please choose a different name.
              </div>
            )}
          </div>
        ) : null;

        const ghostElement = showGhost ? (
          <div
            key="__ghost_transfer"
            className="flex items-center gap-1 px-1 py-1 text-xs rounded-sm animate-pulse"
            style={{ paddingLeft: `${(depth + 1) * 10 + 4}px` }}
          >
            <Loader2 size={12} className="animate-spin text-neutral-400 shrink-0" />
            <span className="font-medium text-xs text-neutral-400 dark:text-neutral-500 truncate">
              {transferring.fileName}
            </span>
          </div>
        ) : null;

        const renderChild = (child: FileTreeNode) => (
          <FileTreeNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            onDeleteFile={onDeleteFile}
            onCopyPath={onCopyPath}
            activeNotebookPath={activeNotebookPath}
            onDuplicateFile={onDuplicateFile}
            onDownloadFile={onDownloadFile}
            onExportFile={onExportFile}
            editingPath={editingPath}
            editingName={editingName}
            setEditingName={setEditingName}
            editInputRef={editInputRef}
            onStartRename={onStartRename}
            onFinishRename={onFinishRename}
            onCancelRename={onCancelRename}
            onCreateDirectory={onCreateDirectory}
            onDeleteDirectory={onDeleteDirectory}
            dropTargetDir={dropTargetDir}
            isDragging={isDragging}
            externalDropTargetDir={externalDropTargetDir}
            transferring={transferring}
            onNodeContextMenu={onNodeContextMenu}
            selectedPaths={selectedPaths}
            onNodeSelect={onNodeSelect}
            pendingNewFile={pendingNewFile}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            newFileInputRef={newFileInputRef}
            newFileError={newFileError}
            onCommitNewFile={onCommitNewFile}
            onCancelNewFile={onCancelNewFile}
          />
        );

        return (
          <div>
            {newFileElement}
            {node.children.map((child, i) => (
              ghostElement && i === ghostIndex
                ? <Fragment key={child.path}>{ghostElement}{renderChild(child)}</Fragment>
                : renderChild(child)
            ))}
            {ghostElement && ghostIndex >= node.children.length && ghostElement}
            {node.children.length === 0 && !showNewFile && !showGhost && (
              <div
                className="text-[9px] text-neutral-400 dark:text-neutral-500 italic py-1"
                style={{ paddingLeft: `${(depth + 1) * 10 + 16}px` }}
              >
                Empty
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
