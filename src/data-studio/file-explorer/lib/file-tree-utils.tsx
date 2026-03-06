import type { FileInfo } from "../../runtime";
import type { FileTreeNode } from "./types";
import { MOUNT_ROOT, LOCAL_MOUNT } from "../../lib/paths";
import { getFileType } from "../../lib/file-types";

/**
 * Build a file tree from a flat list of files.
 */
export function buildFileTree(files: FileInfo[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "mnt",
    path: MOUNT_ROOT,
    isDirectory: true,
    children: [
      {
        name: "local",
        path: LOCAL_MOUNT,
        isDirectory: true,
        children: [],
      },
    ],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = "/" + parts.slice(0, i + 1).join("/");

      if (!current.children) current.children = [];

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        const isDir = isLast ? file.isDirectory : true;

        child = {
          name: part,
          path: currentPath,
          isDirectory: isDir,
          size: isLast && !file.isDirectory ? file.size : undefined,
          children: isDir ? [] : undefined,
        };
        current.children.push(child);
      } else if (isLast && file.isDirectory && !child.children) {
        child.children = [];
      }
      current = child;
    }
  }

  function sortChildren(node: FileTreeNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        const aPriority = getFileType(a.name).sortPriority;
        const bPriority = getFileType(b.name).sortPriority;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  }
  sortChildren(root);

  return root;
}

export function FileIconForName({ name, size, className }: { name: string; size: number; className?: string }) {
  const ft = getFileType(name);
  const Icon = ft.icon;
  return <span className={className}><Icon size={size} color={ft.iconColor || undefined} /></span>;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
