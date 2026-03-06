import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeNode } from "../lib/types";
import type { RuntimeContextValue } from "../../provider/runtime-provider";

export function useFileRename(
  nodeMap: Map<string, FileTreeNode>,
  runtime: RuntimeContextValue,
  clearSelection: () => void,
) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingPath && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPath]);

  const handleStartRename = useCallback(
    (path: string, currentName: string) => {
      clearSelection();
      setEditingPath(path);
      setEditingName(currentName);
    },
    [clearSelection],
  );

  // Use refs to capture current values for the blur handler
  const editingPathRef = useRef(editingPath);
  const editingNameRef = useRef(editingName);
  useEffect(() => {
    editingPathRef.current = editingPath;
    editingNameRef.current = editingName;
  }, [editingPath, editingName]);

  const handleFinishRename = useCallback(async () => {
    const currentEditingPath = editingPathRef.current;
    const currentEditingName = editingNameRef.current;

    if (!currentEditingPath || !currentEditingName?.trim()) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    const node = nodeMap.get(currentEditingPath);
    if (!node) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    const trimmedName = currentEditingName.trim();

    if (trimmedName === node.name) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    const pathToRename = currentEditingPath;
    const isDirectory = node.isDirectory;

    editingPathRef.current = null;
    editingNameRef.current = "";
    setEditingPath(null);
    setEditingName("");

    try {
      if (isDirectory) {
        await runtime.renameDirectory(pathToRename, trimmedName);
      } else {
        await runtime.renameFile(pathToRename, trimmedName);
      }
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  }, [nodeMap, runtime]);

  const handleCancelRename = useCallback(() => {
    setEditingPath(null);
    setEditingName("");
  }, []);

  return {
    editingPath,
    editingName,
    setEditingName,
    editInputRef,
    handleStartRename,
    handleFinishRename,
    handleCancelRename,
  };
}
