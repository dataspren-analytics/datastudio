/**
 * OPFS Storage Device
 *
 * Pure storage backend using the Origin Private File System (OPFS).
 * This device knows NOTHING about Emscripten - it's just storage.
 *
 * The VirtualFS layer handles Emscripten integration separately.
 *
 * Features:
 * - Persistent browser storage (survives page refresh)
 * - Synchronous access handles for byte-range operations
 * - Works only in Web Workers (createSyncAccessHandle requirement)
 *
 * Usage:
 *   const opfsDevice = createOPFSDevice();
 *   await opfsDevice.init();
 *   await opfsDevice.writeFile('data.csv', buffer);
 */

import {
  type FileInfo,
  type FileStat,
  type ISyncFileHandle,
  type IStorageDevice,
  parsePath,
  getParentPath,
  getFileName,
} from "./device";

// Re-export for convenience
export type { IStorageDevice } from "./device";

// ============================================================================
// OPFS-specific Types
// ============================================================================

// File System Access API types (not fully available in all TypeScript libs)
declare global {
  interface FileSystemSyncAccessHandle {
    read(buffer: ArrayBufferView, options?: { at?: number }): number;
    write(buffer: ArrayBufferView, options?: { at?: number }): number;
    truncate(newSize: number): void;
    getSize(): number;
    flush(): void;
    close(): void;
  }

  interface FileSystemFileHandle {
    createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
    move(target: FileSystemDirectoryHandle, name?: string): Promise<void>;
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }
}

/**
 * Wrapper for FileSystemSyncAccessHandle that implements ISyncFileHandle.
 */
class OPFSSyncHandle implements ISyncFileHandle {
  constructor(private accessHandle: FileSystemSyncAccessHandle) {}

  read(buffer: Uint8Array, options?: { at?: number }): number {
    return this.accessHandle.read(buffer, options);
  }

  write(buffer: Uint8Array, options?: { at?: number }): number {
    return this.accessHandle.write(buffer, options);
  }

  truncate(newSize: number): void {
    this.accessHandle.truncate(newSize);
  }

  getSize(): number {
    return this.accessHandle.getSize();
  }

  flush(): void {
    this.accessHandle.flush();
  }

  close(): void {
    this.accessHandle.close();
  }
}

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = "[OPFSDevice]";


// ============================================================================
// OPFS Device Implementation
// ============================================================================

/**
 * Create an OPFS-backed storage device.
 *
 * This is a PURE STORAGE device - no Emscripten knowledge.
 * The VirtualFS layer handles Emscripten integration.
 *
 * @returns An IStorageDevice implementation backed by OPFS
 */
export function createOPFSDevice(): IStorageDevice {
  let initialized = false;

  // Track open sync handles so we can close them on dispose
  const openHandles = new Map<string, FileSystemSyncAccessHandle>();

  // ========== Internal Helpers ==========

  function ensureInitialized(): void {
    if (!initialized) {
      throw new Error("OPFS device not initialized. Call init() first.");
    }
  }

  /**
   * Navigate to a directory in OPFS, optionally creating it.
   */
  async function navigateToDirectory(
    root: FileSystemDirectoryHandle,
    dirParts: string[],
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandle> {
    let dir = root;
    for (const part of dirParts) {
      dir = await dir.getDirectoryHandle(part, options);
    }
    return dir;
  }

  /**
   * Get a file handle, navigating through directories.
   */
  async function getFileHandle(
    relativePath: string,
    options?: { create?: boolean }
  ): Promise<FileSystemFileHandle> {
    const { dirParts, fileName } = parsePath(relativePath);
    const root = await navigator.storage.getDirectory();
    const dir = await navigateToDirectory(root, dirParts, options);
    return dir.getFileHandle(fileName, options);
  }

  /**
   * Recursively list files and directories from OPFS.
   * Returns paths relative to device root.
   */
  async function listFilesRecursive(
    dir: FileSystemDirectoryHandle,
    pathPrefix: string
  ): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    for await (const [name, handle] of dir.entries()) {
      const relativePath = pathPrefix ? `${pathPrefix}/${name}` : name;

      if (handle.kind === "file") {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({
          name,
          path: relativePath,
          size: file.size,
          isDirectory: false,
        });
      } else if (handle.kind === "directory") {
        files.push({
          name,
          path: relativePath,
          size: 0,
          isDirectory: true,
        });
        const subFiles = await listFilesRecursive(
          handle as FileSystemDirectoryHandle,
          relativePath
        );
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Copy directory contents recursively (for rename operations).
   */
  async function copyDirectoryContents(
    source: FileSystemDirectoryHandle,
    target: FileSystemDirectoryHandle
  ): Promise<void> {
    for await (const [name, handle] of source.entries()) {
      if (handle.kind === "file") {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const data = new Uint8Array(await file.arrayBuffer());

        const newFileHandle = await target.getFileHandle(name, { create: true });
        const accessHandle = await newFileHandle.createSyncAccessHandle();
        try {
          accessHandle.truncate(0);
          accessHandle.write(data, { at: 0 });
          accessHandle.flush();
        } finally {
          accessHandle.close();
        }
      } else if (handle.kind === "directory") {
        const dirHandle = handle as FileSystemDirectoryHandle;
        const newDirHandle = await target.getDirectoryHandle(name, { create: true });
        await copyDirectoryContents(dirHandle, newDirHandle);
      }
    }
  }

  // ========== IStorageDevice Implementation ==========

  return {
    async init(): Promise<void> {
      if (initialized) {
        console.warn(LOG_PREFIX, "Already initialized");
        return;
      }

      console.log(LOG_PREFIX, "Initializing OPFS device");

      // Verify OPFS is available
      try {
        await navigator.storage.getDirectory();
      } catch (e) {
        throw new Error(`OPFS not available: ${e}`);
      }

      initialized = true;
      console.log(LOG_PREFIX, "Initialized successfully");
    },

    // ========== File Operations ==========

    async writeFile(relativePath: string, data: ArrayBuffer): Promise<void> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Writing file: ${relativePath} (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`);

      // If a sync access handle is already open, write through it directly.
      const existingHandle = openHandles.get(relativePath);
      if (existingHandle) {
        existingHandle.truncate(0);
        existingHandle.write(new Uint8Array(data), { at: 0 });
        existingHandle.flush();
        console.log(LOG_PREFIX, `File written via existing sync handle: ${relativePath}`);
        return;
      }

      // No sync handle open — open a temporary one.
      // Never use createWritable() as it conflicts with sync access handle locks.
      const handle = await getFileHandle(relativePath, { create: true });
      const accessHandle = await handle.createSyncAccessHandle();
      try {
        accessHandle.truncate(0);
        accessHandle.write(new Uint8Array(data), { at: 0 });
        accessHandle.flush();
      } finally {
        accessHandle.close();
      }
      console.log(LOG_PREFIX, `File written via temp sync handle: ${relativePath}`);
    },

    async readFile(relativePath: string): Promise<Uint8Array> {
      ensureInitialized();

      // If a sync access handle is open, read through it directly.
      const existingHandle = openHandles.get(relativePath);
      if (existingHandle) {
        const size = existingHandle.getSize();
        const buffer = new Uint8Array(size);
        existingHandle.read(buffer, { at: 0 });
        return buffer;
      }

      const handle = await getFileHandle(relativePath);
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    },

    async deleteFile(relativePath: string): Promise<boolean> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Deleting file: ${relativePath}`);

      // Close any open handle first
      const existingHandle = openHandles.get(relativePath);
      if (existingHandle) {
        existingHandle.close();
        openHandles.delete(relativePath);
      }

      try {
        const { dirParts, fileName } = parsePath(relativePath);
        const root = await navigator.storage.getDirectory();
        const dir = await navigateToDirectory(root, dirParts);
        await dir.removeEntry(fileName);
        console.log(LOG_PREFIX, `File deleted: ${relativePath}`);
        return true;
      } catch (e) {
        console.warn(LOG_PREFIX, `Failed to delete file: ${relativePath}`, e);
        return false;
      }
    },

    async fileExists(relativePath: string): Promise<boolean> {
      try {
        await getFileHandle(relativePath);
        return true;
      } catch {
        return false;
      }
    },

    // ========== Directory Operations ==========

    async createDirectory(relativePath: string): Promise<void> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Creating directory: ${relativePath}`);

      const parts = relativePath.split("/").filter(Boolean);
      const root = await navigator.storage.getDirectory();
      let currentDir = root;
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: true });
      }

      console.log(LOG_PREFIX, `Directory created: ${relativePath}`);
    },

    async deleteDirectory(relativePath: string): Promise<boolean> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Deleting directory: ${relativePath}`);

      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length === 0) {
        console.warn(LOG_PREFIX, "Cannot delete root directory");
        return false;
      }

      // Close any open handles for files in this directory
      for (const [path, handle] of openHandles) {
        if (path.startsWith(relativePath + "/") || path === relativePath) {
          handle.close();
          openHandles.delete(path);
        }
      }

      try {
        const root = await navigator.storage.getDirectory();
        const parentParts = parts.slice(0, -1);
        const dirName = parts[parts.length - 1];
        const parentDir = await navigateToDirectory(root, parentParts);

        await parentDir.removeEntry(dirName, { recursive: true });

        console.log(LOG_PREFIX, `Directory deleted: ${relativePath}`);
        return true;
      } catch (e) {
        console.warn(LOG_PREFIX, `Failed to delete directory: ${relativePath}`, e);
        return false;
      }
    },

    async renameDirectory(relativePath: string, newName: string): Promise<void> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Renaming directory: ${relativePath} -> ${newName}`);

      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length === 0) {
        throw new Error("Cannot rename root directory");
      }

      // Close any open handles for files in this directory
      for (const [path, handle] of openHandles) {
        if (path.startsWith(relativePath + "/")) {
          handle.close();
          openHandles.delete(path);
        }
      }

      const parentParts = parts.slice(0, -1);
      const oldDirName = parts[parts.length - 1];

      const root = await navigator.storage.getDirectory();
      const parentDir = await navigateToDirectory(root, parentParts);

      // Get old directory, create new, copy contents, delete old
      const oldDir = await parentDir.getDirectoryHandle(oldDirName);
      const newDir = await parentDir.getDirectoryHandle(newName, { create: true });
      await copyDirectoryContents(oldDir, newDir);
      await parentDir.removeEntry(oldDirName, { recursive: true });

      console.log(LOG_PREFIX, `Directory renamed: ${oldDirName} -> ${newName}`);
    },

    // ========== Move/Rename Operations ==========

    async moveFile(sourcePath: string, targetDir: string): Promise<string> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Moving file: ${sourcePath} -> ${targetDir}`);

      const fileName = getFileName(sourcePath);
      if (!fileName) {
        throw new Error(`Invalid source path: ${sourcePath}`);
      }

      // Close any open handle for source file
      const existingHandle = openHandles.get(sourcePath);
      if (existingHandle) {
        existingHandle.close();
        openHandles.delete(sourcePath);
      }

      const root = await navigator.storage.getDirectory();

      // Get source file handle
      const { dirParts: sourceDirParts } = parsePath(sourcePath);
      const sourceDir = await navigateToDirectory(root, sourceDirParts);
      const sourceHandle = await sourceDir.getFileHandle(fileName);

      // Get target directory handle
      const targetParts = targetDir.split("/").filter(Boolean);
      const targetDirHandle = await navigateToDirectory(root, targetParts, { create: true });

      const newRelativePath = targetDir ? `${targetDir}/${fileName}` : fileName;

      // Close any open handle for target file
      const targetHandle = openHandles.get(newRelativePath);
      if (targetHandle) {
        targetHandle.close();
        openHandles.delete(newRelativePath);
      }

      // Try to delete existing file at target
      try {
        await targetDirHandle.removeEntry(fileName);
      } catch {
        // File doesn't exist, that's fine
      }

      // Use move() if available, otherwise copy+delete
      if ("move" in sourceHandle && typeof sourceHandle.move === "function") {
        await sourceHandle.move(targetDirHandle);
      } else {
        // Fallback: copy and delete (using sync access handles, never createWritable)
        const file = await sourceHandle.getFile();
        const data = new Uint8Array(await file.arrayBuffer());

        const targetFileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
        const accessHandle = await targetFileHandle.createSyncAccessHandle();
        try {
          accessHandle.truncate(0);
          accessHandle.write(data, { at: 0 });
          accessHandle.flush();
        } finally {
          accessHandle.close();
        }

        await sourceDir.removeEntry(fileName);
      }

      console.log(LOG_PREFIX, `File moved to: ${newRelativePath}`);
      return newRelativePath;
    },

    async renameFile(relativePath: string, newName: string): Promise<string> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Renaming file: ${relativePath} -> ${newName}`);

      const parentPath = getParentPath(relativePath);
      const oldFileName = getFileName(relativePath);

      if (!oldFileName) {
        throw new Error(`Invalid path: ${relativePath}`);
      }

      // Close any open handle for source file
      const existingHandle = openHandles.get(relativePath);
      if (existingHandle) {
        existingHandle.close();
        openHandles.delete(relativePath);
      }

      const root = await navigator.storage.getDirectory();

      // Navigate to parent directory
      const parentParts = parentPath.split("/").filter(Boolean);
      const parentDir = await navigateToDirectory(root, parentParts);

      // Get source file handle
      const sourceHandle = await parentDir.getFileHandle(oldFileName);

      const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;

      // Close any open handle for target file
      const targetHandle = openHandles.get(newRelativePath);
      if (targetHandle) {
        targetHandle.close();
        openHandles.delete(newRelativePath);
      }

      // Try to delete existing file with new name
      try {
        await parentDir.removeEntry(newName);
      } catch {
        // File doesn't exist, that's fine
      }

      // Use move() with new name if available
      if ("move" in sourceHandle && typeof sourceHandle.move === "function") {
        await sourceHandle.move(parentDir, newName);
      } else {
        // Fallback: copy and delete (using sync access handles, never createWritable)
        const file = await sourceHandle.getFile();
        const data = new Uint8Array(await file.arrayBuffer());

        const newFileHandle = await parentDir.getFileHandle(newName, { create: true });
        const accessHandle = await newFileHandle.createSyncAccessHandle();
        try {
          accessHandle.truncate(0);
          accessHandle.write(data, { at: 0 });
          accessHandle.flush();
        } finally {
          accessHandle.close();
        }

        await parentDir.removeEntry(oldFileName);
      }

      console.log(LOG_PREFIX, `File renamed to: ${newRelativePath}`);
      return newRelativePath;
    },

    // ========== Listing & Metadata ==========

    async listAllFiles(): Promise<FileInfo[]> {
      ensureInitialized();
      console.log(LOG_PREFIX, "Listing all files from OPFS...");
      const root = await navigator.storage.getDirectory();
      const files = await listFilesRecursive(root, "");
      console.log(LOG_PREFIX, `Found ${files.length} files in OPFS:`, files.map(f => `${f.path} (${f.size} bytes)`));
      return files;
    },

    async stat(relativePath: string): Promise<FileStat | null> {
      ensureInitialized();

      try {
        const parts = relativePath.split("/").filter(Boolean);
        const root = await navigator.storage.getDirectory();

        if (parts.length === 0) {
          // Stat on root directory
          return { size: 0, isDirectory: true };
        }

        // Navigate to parent directory
        let dir = root;
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await dir.getDirectoryHandle(parts[i]);
        }

        const name = parts[parts.length - 1];

        // Try as file first
        try {
          const fileHandle = await dir.getFileHandle(name);
          const file = await fileHandle.getFile();
          return {
            size: file.size,
            isDirectory: false,
            mtime: file.lastModified,
          };
        } catch {
          // Not a file, try as directory
          try {
            await dir.getDirectoryHandle(name);
            return { size: 0, isDirectory: true };
          } catch {
            // Neither file nor directory
            return null;
          }
        }
      } catch {
        return null;
      }
    },

    // ========== Sync Access ==========

    async openSyncHandle(relativePath: string): Promise<ISyncFileHandle | null> {
      ensureInitialized();

      // Reuse existing handle if one is already open. Closing an in-use
      // handle causes a fatal Pyodide crash when DuckDB tries to read
      // through it (InvalidStateError on FileSystemSyncAccessHandle).
      const existing = openHandles.get(relativePath);
      if (existing) {
        return new OPFSSyncHandle(existing);
      }

      try {
        const handle = await getFileHandle(relativePath);
        const accessHandle = await handle.createSyncAccessHandle();
        const size = accessHandle.getSize();
        console.log(LOG_PREFIX, `Opened sync handle for: ${relativePath} (size=${size} bytes)`);
        openHandles.set(relativePath, accessHandle);
        return new OPFSSyncHandle(accessHandle);
      } catch (e) {
        console.warn(LOG_PREFIX, `Failed to open sync handle for ${relativePath}:`, e);
        return null;
      }
    },

    async closeSyncHandle(relativePath: string): Promise<void> {
      const handle = openHandles.get(relativePath);
      if (handle) {
        handle.close();
        openHandles.delete(relativePath);
      }
    },

    // ========== Lifecycle ==========

    dispose(): void {
      console.log(LOG_PREFIX, "Disposing OPFS device");

      // Close all open handles
      for (const [path, handle] of openHandles) {
        try {
          handle.close();
          console.log(LOG_PREFIX, `Closed handle for ${path}`);
        } catch (e) {
          console.warn(LOG_PREFIX, `Failed to close handle for ${path}:`, e);
        }
      }

      openHandles.clear();
      initialized = false;

      console.log(LOG_PREFIX, "Disposed");
    },
  };
}
