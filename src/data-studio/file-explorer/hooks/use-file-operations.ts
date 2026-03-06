import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileTreeNode, PendingDelete, PendingNewFile } from "../lib/types";
import type { RuntimeContextValue } from "../../provider/runtime-provider";
import { LOCAL_MOUNT } from "../../lib/paths";
import { getFileType } from "../../lib/file-types";
import { downloadBlob } from "../../lib/file-export";

export function useFileOperations(
  runtime: RuntimeContextValue,
  nodeMap: Map<string, FileTreeNode>,
  selectFile: (path: string | null) => void,
  clearSelection: () => void,
  expandPath?: (path: string) => void,
) {
  const [pendingNewFile, setPendingNewFile] = useState<PendingNewFile | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Delay focus so the dropdown menu finishes closing first
  useEffect(() => {
    if (!pendingNewFile) return;
    const id = setTimeout(() => {
      const el = newFileInputRef.current;
      if (!el) return;
      el.focus();
      const dotIdx = pendingNewFile.defaultName.lastIndexOf(".");
      if (dotIdx > 0) {
        el.setSelectionRange(0, dotIdx);
      } else {
        el.select();
      }
    }, 50);
    return () => clearTimeout(id);
  }, [pendingNewFile]);

  const newFileError = useMemo(() => {
    if (!pendingNewFile || !newFileName.trim()) return null;
    const targetPath = `${pendingNewFile.parentDir}/${newFileName.trim()}`;
    if (nodeMap.has(targetPath)) {
      return `A file or folder **${newFileName.trim()}** already exists at this location. Please choose a different name.`;
    }
    return null;
  }, [pendingNewFile, newFileName, nodeMap]);

  const [createDirParent, setCreateDirParent] = useState<string | null>(null);
  const [createDirName, setCreateDirName] = useState("");
  const createDirInputRef = useRef<HTMLInputElement>(null);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingBulkDeleteRef = useRef<Set<string> | null>(null);

  const handleDuplicateFile = useCallback(async (filePath: string) => {
    try {
      const data = await runtime.readFile(filePath);
      const fileName = filePath.split("/").pop() ?? "file";
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
      const baseName = ext ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;

      let copyName = `${baseName} (copy)${ext}`;
      if (nodeMap.has(`${parentDir}/${copyName}`)) {
        let n = 1;
        while (nodeMap.has(`${parentDir}/${baseName} (copy ${n})${ext}`)) n++;
        copyName = `${baseName} (copy ${n})${ext}`;
      }

      const blob = new Blob([new Uint8Array(data)]);
      const file = new File([blob], copyName);
      await runtime.writeFile(file, parentDir);
    } catch (e) {
      console.error("Failed to duplicate file:", e);
    }
  }, [runtime, nodeMap]);

  const handleDownloadFile = useCallback(async (filePath: string) => {
    try {
      const data = await runtime.readFile(filePath);
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() ?? "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download file:", e);
    }
  }, [runtime]);

  const handleExportFile = useCallback(async (filePath: string, targetFormat: string) => {
    try {
      const data = await runtime.convertFile(filePath, targetFormat);
      const blob = new Blob([data.slice()]);
      const baseName = (filePath.split("/").pop() ?? "file").replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${baseName}.${targetFormat}`);
    } catch (e) {
      console.error("Failed to export file:", e);
      alert(`Failed to export: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }, [runtime]);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  const disambiguateName = useCallback((parentDir: string, baseName: string, ext: string) => {
    let candidate = ext ? `${baseName}.${ext}` : baseName;
    if (!nodeMap.has(`${parentDir}/${candidate}`)) return candidate;
    let n = 2;
    while (nodeMap.has(`${parentDir}/${ext ? `${baseName} ${n}.${ext}` : `${baseName} ${n}`}`)) n++;
    return ext ? `${baseName} ${n}.${ext}` : `${baseName} ${n}`;
  }, [nodeMap]);

  const handleCreateFile = useCallback(async (extension: string) => {
    const baseName = getFileType(`f.${extension}`).defaultBaseName ?? "untitled";
    const defaultName = disambiguateName(LOCAL_MOUNT, baseName, extension);
    expandPath?.(LOCAL_MOUNT);

    const targetPath = `${LOCAL_MOUNT}/${defaultName}`;
    const blob = getFileType(defaultName).createNewFileContent(defaultName);
    const file = new File([blob], defaultName);
    await runtime.writeFile(file, LOCAL_MOUNT);
    selectFile(targetPath);
  }, [expandPath, disambiguateName, runtime, selectFile]);

  const commitNewFile = useCallback(async (parentDir: string, name: string) => {
    if (!name.trim()) {
      setPendingNewFile(null);
      setNewFileName("");
      return;
    }
    const trimmed = name.trim();
    const targetPath = `${parentDir}/${trimmed}`;
    if (nodeMap.has(targetPath)) return;

    setPendingNewFile(null);
    setNewFileName("");

    const blob = getFileType(trimmed).createNewFileContent(trimmed);

    const file = new File([blob], trimmed);
    await runtime.writeFile(file, parentDir);
    selectFile(targetPath);
  }, [runtime, selectFile, nodeMap]);

  const handleCancelNewFile = useCallback(() => {
    setPendingNewFile(null);
    setNewFileName("");
  }, []);

  useEffect(() => {
    if (!pendingNewFile) return;
    const onMouseDown = (e: MouseEvent) => {
      if (newFileInputRef.current && !newFileInputRef.current.contains(e.target as Node)) {
        commitNewFile(pendingNewFile.parentDir, newFileInputRef.current.value);
      }
    };
    // Delay so the listener isn't registered during the same tick as the opening click
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onMouseDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [pendingNewFile, commitNewFile]);

  const handleCreateDirectory = useCallback((parentPath: string) => {
    setCreateDirParent(parentPath);
    setCreateDirName("");
    setTimeout(() => createDirInputRef.current?.focus(), 0);
  }, []);

  const handleConfirmCreateDirectory = useCallback(async () => {
    if (!createDirParent || !createDirName.trim()) return;
    const newPath = `${createDirParent}/${createDirName.trim()}`;
    setCreateDirParent(null);
    setCreateDirName("");
    await runtime.createDirectory(newPath);
  }, [createDirParent, createDirName, runtime]);

  const handleDeleteDirectory = useCallback((path: string) => {
    const node = nodeMap.get(path);
    setPendingDelete({ path, name: node?.name ?? path, isDirectory: true });
  }, [nodeMap]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { path, isDirectory } = pendingDelete;
    setPendingDelete(null);
    if (isDirectory) {
      await runtime.deleteDirectory(path);
    } else {
      await runtime.deleteFile(path);
    }
  }, [pendingDelete, runtime]);

  const handleBulkDelete = useCallback((paths: Set<string>) => {
    const count = paths.size;
    pendingBulkDeleteRef.current = paths;
    setPendingDelete({ path: "", name: `${count} item${count > 1 ? "s" : ""}`, isDirectory: false, count });
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    const paths = pendingBulkDeleteRef.current;
    setPendingDelete(null);
    pendingBulkDeleteRef.current = null;
    if (!paths) return;
    const sorted = [...paths].sort((a, b) => b.split("/").length - a.split("/").length);
    for (const p of sorted) {
      const node = nodeMap.get(p);
      if (node?.isDirectory) {
        await runtime.deleteDirectory(p);
      } else {
        await runtime.deleteFile(p);
      }
    }
    clearSelection();
  }, [runtime, nodeMap, clearSelection]);

  const handleBulkDownload = useCallback(async (paths: Set<string>) => {
    for (const p of paths) {
      const node = nodeMap.get(p);
      if (node?.isDirectory) continue;
      await handleDownloadFile(p);
    }
  }, [handleDownloadFile, nodeMap]);

  return {
    handleDuplicateFile,
    handleDownloadFile,
    handleExportFile,
    handleCopyPath,
    handleCreateFile,
    pendingNewFile,
    newFileName,
    setNewFileName,
    newFileInputRef,
    newFileError,
    commitNewFile,
    handleCancelNewFile,
    createDirParent,
    createDirName,
    createDirInputRef,
    setCreateDirName,
    setCreateDirParent,
    handleCreateDirectory,
    handleConfirmCreateDirectory,
    handleDeleteDirectory,
    pendingDelete,
    setPendingDelete,
    handleConfirmDelete,
    handleBulkDelete,
    handleConfirmBulkDelete,
    handleBulkDownload,
  };
}
