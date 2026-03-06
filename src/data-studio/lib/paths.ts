export const MOUNT_ROOT = "/mnt";
export const LOCAL_MOUNT = "/mnt/local";
export const OPFS_PREFIX = "/mnt/local/";
export const DEFAULT_EXPANDED_PATHS = ["/mnt", "/mnt/local"];

export function getFileName(path: string, fallback = "file"): string {
  return path.split("/").pop() || fallback;
}

/** Returns lowercase extension without dot, or `null`. */
export function getFileExtension(path: string): string | null {
  const name = path.split("/").pop() || "";
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  return name.slice(dotIdx + 1).toLowerCase();
}

export function getParentDir(path: string): string | undefined {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : undefined;
}

export function joinPath(...segments: string[]): string {
  return segments.join("/").replace(/\/{2,}/g, "/");
}

export function isNotebookFile(nameOrPath: string): boolean {
  return nameOrPath.endsWith(".ipynb");
}

/** Strip the `/mnt` prefix to get a path relative to MOUNT_ROOT. */
export function toRelativePath(fullPath: string): string {
  if (fullPath.startsWith(MOUNT_ROOT + "/")) {
    return fullPath.slice(MOUNT_ROOT.length + 1);
  }
  if (fullPath.startsWith(MOUNT_ROOT)) {
    return fullPath.slice(MOUNT_ROOT.length);
  }
  return fullPath.replace(/^\/+/, "");
}

export function toAbsolutePath(relativePath: string, mount = LOCAL_MOUNT): string {
  return `${mount}/${relativePath}`;
}

/** Strip OPFS_PREFIX to get an OPFS-relative path. */
export function toOPFSPath(absolutePath: string): string {
  if (absolutePath.startsWith(OPFS_PREFIX)) {
    return absolutePath.slice(OPFS_PREFIX.length);
  }
  return absolutePath;
}
