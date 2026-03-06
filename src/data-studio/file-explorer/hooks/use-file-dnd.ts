import { useCallback, useEffect, useRef, useState } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { FileTreeNode, PendingMove, DropTargetDir, TransferState } from "../lib/types";
import type { RuntimeContextValue } from "../../provider/runtime-provider";

export function useFileDnd(
  nodeMap: Map<string, FileTreeNode>,
  runtime: RuntimeContextValue,
  expandPath: (path: string) => void,
  clearSelection: () => void,
) {
  const [draggedNode, setDraggedNode] = useState<FileTreeNode | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<DropTargetDir>(null);
  const dropTargetDirRef = useRef<DropTargetDir>(null);
  useEffect(() => { dropTargetDirRef.current = dropTargetDir; }, [dropTargetDir]);

  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [transferring, setTransferring] = useState<TransferState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Auto-expand target directory when transfer starts
  useEffect(() => {
    if (transferring) {
      expandPath(transferring.targetDir);
    }
  }, [transferring, expandPath]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    clearSelection();
    const node = event.active.data.current?.node as FileTreeNode | undefined;
    const dragId = String(event.active.id);
    const path = dragId.startsWith("drag:") ? dragId.slice(5) : dragId;
    const fallbackNode = nodeMap.get(path);
    const sourceNode = node || fallbackNode;

    if (sourceNode && !sourceNode.isDirectory) {
      setDraggedNode(sourceNode);
    }
  }, [nodeMap, clearSelection]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const targetDir = dropTargetDirRef.current;
    setDraggedNode(null);
    setDropTargetDir(null);

    if (!targetDir) return;

    const sourceNode = event.active.data.current?.node as FileTreeNode | undefined;
    const activeId = String(event.active.id);
    const sourcePath = activeId.startsWith("drag:") ? activeId.slice(5) : activeId;
    const source = sourceNode || nodeMap.get(sourcePath);

    if (!source) return;

    const sourceParentPath = source.path.substring(0, source.path.lastIndexOf("/"));
    if (sourceParentPath === targetDir) return;

    const fileName = source.name;
    const targetFilePath = `${targetDir}/${fileName}`;
    const existingFile = nodeMap.get(targetFilePath);

    if (existingFile && !existingFile.isDirectory) {
      setPendingMove({
        sourcePath: source.path,
        targetDir,
        fileName,
        existingFileName: existingFile.name,
      });
      return;
    }

    try {
      setTransferring({ fileName: source.name, targetDir, sourcePath: source.path });
      await runtime.moveFile(source.path, targetDir);
    } catch (e) {
      console.error("Failed to move file:", e);
    } finally {
      setTransferring(null);
    }
  }, [nodeMap, runtime]);

  const pendingMoveRef = useRef<PendingMove | null>(null);
  useEffect(() => { pendingMoveRef.current = pendingMove; }, [pendingMove]);

  const handleConfirmMove = useCallback(async () => {
    const move = pendingMoveRef.current;
    if (!move) return;

    setPendingMove(null);

    try {
      setTransferring({ fileName: move.fileName, targetDir: move.targetDir, sourcePath: move.sourcePath });
      await runtime.moveFile(move.sourcePath, move.targetDir);
    } catch (e) {
      console.error("Failed to move file:", e);
    } finally {
      setTransferring(null);
    }
  }, [runtime]);

  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!event.over) {
      setDropTargetDir(null);
      return;
    }

    const overId = String(event.over.id);
    const path = overId.startsWith("drop:") ? overId.slice(5) : overId;
    const targetNode = nodeMap.get(path);

    if (!targetNode) {
      setDropTargetDir(null);
      return;
    }

    if (draggedNode && path === draggedNode.path) {
      setDropTargetDir(null);
      return;
    }

    const resolvedDir = targetNode.isDirectory
      ? targetNode.path
      : targetNode.path.substring(0, targetNode.path.lastIndexOf("/"));

    if (draggedNode) {
      const sourceParent = draggedNode.path.substring(0, draggedNode.path.lastIndexOf("/"));
      if (resolvedDir === sourceParent) {
        setDropTargetDir(null);
        return;
      }
    }

    if (dropTargetDirRef.current === resolvedDir) return;

    setDropTargetDir(resolvedDir);
  }, [nodeMap, draggedNode]);

  return {
    sensors,
    draggedNode,
    dropTargetDir,
    pendingMove,
    transferring,
    handleDragStart,
    handleDragEnd,
    handleDragMove,
    handleConfirmMove,
    handleCancelMove,
  };
}
