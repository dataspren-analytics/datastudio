/**
 * Storage Device Interfaces
 *
 * This file defines the interfaces for storage devices (OPFS, S3, etc.).
 * Storage devices are PURE STORAGE - they know nothing about Emscripten.
 * The VirtualFS layer handles Emscripten integration separately.
 */

// ============================================================================
// File Types
// ============================================================================

/**
 * Information about a file or directory in the storage system.
 */
export interface FileInfo {
  /** File or directory name */
  name: string;
  /** Full path in the virtual filesystem */
  path: string;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * File metadata returned by stat().
 * Similar to Unix stat but simplified.
 */
export interface FileStat {
  /** File size in bytes (0 for directories) */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Last modified timestamp (ms since epoch), if available */
  mtime?: number;
}

// ============================================================================
// Sync File Handle (for byte-range access)
// ============================================================================

/**
 * Synchronous file handle for byte-range read/write access.
 * Used by VFS to bridge storage devices to Emscripten's sync filesystem.
 *
 * Not all devices support this - S3 for example would need to buffer.
 * Devices that don't support sync access can still work, but Python
 * will read the entire file into memory.
 */
export interface ISyncFileHandle {
  /** Read bytes from the file at a specific position */
  read(buffer: Uint8Array, options?: { at?: number }): number;

  /** Write bytes to the file at a specific position */
  write(buffer: Uint8Array, options?: { at?: number }): number;

  /** Truncate or extend the file to the given size */
  truncate(newSize: number): void;

  /** Get the current file size */
  getSize(): number;

  /** Flush any buffered writes */
  flush(): void;

  /** Close the handle and release resources */
  close(): void;
}

// ============================================================================
// Storage Device Interface
// ============================================================================

/**
 * Interface for storage device implementations.
 *
 * IMPORTANT: Storage devices are PURE STORAGE. They should NOT:
 * - Know about Emscripten or Pyodide
 * - Call any FS.* methods
 * - Create device nodes
 *
 * The VirtualFS layer handles all Emscripten integration.
 *
 * All paths passed to device methods are relative to the device's storage root.
 * For example, "subdir/file.csv" - no leading slashes, no mount path prefix.
 */
export interface IStorageDevice {
  /**
   * Initialize the device.
   * Called when the device is mounted. Should scan for existing files.
   */
  init(): Promise<void>;

  // ========== File Operations ==========

  /**
   * Write a file to storage.
   * @param relativePath - Path relative to device root (e.g., "data.csv", "subdir/file.csv")
   * @param data - File contents
   */
  writeFile(relativePath: string, data: ArrayBuffer): Promise<void>;

  /**
   * Read a file from storage.
   * @param relativePath - Path relative to device root
   * @returns File contents
   */
  readFile(relativePath: string): Promise<Uint8Array>;

  /**
   * Delete a file from storage.
   * @param relativePath - Path relative to device root
   * @returns true if deleted, false if not found
   */
  deleteFile(relativePath: string): Promise<boolean>;

  /**
   * Check if a file exists in storage.
   * @param relativePath - Path relative to device root
   */
  fileExists(relativePath: string): Promise<boolean>;

  // ========== Directory Operations ==========

  /**
   * Create a directory.
   * @param relativePath - Path relative to device root
   */
  createDirectory(relativePath: string): Promise<void>;

  /**
   * Delete a directory and all its contents.
   * @param relativePath - Path relative to device root
   * @returns true if deleted, false if not found
   */
  deleteDirectory(relativePath: string): Promise<boolean>;

  /**
   * Rename a directory.
   * @param relativePath - Current path relative to device root
   * @param newName - New directory name (not full path)
   */
  renameDirectory(relativePath: string, newName: string): Promise<void>;

  // ========== Move/Rename Operations ==========

  /**
   * Move a file to a different directory within this device.
   * @param sourcePath - Current path relative to device root
   * @param targetDir - Target directory relative to device root
   * @returns The new relative path
   */
  moveFile(sourcePath: string, targetDir: string): Promise<string>;

  /**
   * Rename a file.
   * @param relativePath - Current path relative to device root
   * @param newName - New file name (not full path)
   * @returns The new relative path
   */
  renameFile(relativePath: string, newName: string): Promise<string>;

  // ========== Listing & Metadata ==========

  /**
   * List all files and directories recursively.
   * Paths in returned FileInfo should be relative to device root.
   */
  listAllFiles(): Promise<FileInfo[]>;

  /**
   * Get metadata for a single file or directory.
   * @param relativePath - Path relative to device root
   * @returns FileStat if exists, null if not found
   */
  stat(relativePath: string): Promise<FileStat | null>;

  // ========== Sync Access (Optional) ==========

  /**
   * Open a synchronous file handle for byte-range access.
   * This is optional - devices that don't support it return null.
   *
   * Used by VFS to provide efficient access to large files in Python.
   * If not supported, VFS will fall back to reading entire file into memory.
   *
   * @param relativePath - Path relative to device root
   * @returns Sync handle, or null if not supported
   */
  openSyncHandle?(relativePath: string): Promise<ISyncFileHandle | null>;

  /**
   * Close a previously opened sync handle.
   * @param relativePath - Path that was opened
   */
  closeSyncHandle?(relativePath: string): Promise<void>;

  // ========== Lifecycle ==========

  /**
   * Dispose of all resources.
   */
  dispose(): void;
}

// ============================================================================
// Emscripten Types (used by VFS, not by devices)
// ============================================================================

/**
 * Emscripten's virtual filesystem interface.
 * Only used by VirtualFSDevice for bridging to Python.
 */
export type EmscriptenFS = {
  makedev: (major: number, minor: number) => number;
  registerDevice: (dev: number, ops: DeviceOps) => void;
  mkdirTree: (path: string) => void;
  mknod: (path: string, mode: number, dev: number) => void;
  unlink: (path: string) => void;
  rmdir: (path: string) => void;
  lookupPath: (path: string) => { node: FSNode };
  stat: (path: string) => { size: number; mode: number };
  isDir: (mode: number) => boolean;
  readdir: (path: string) => string[];
  writeFile: (path: string, data: Uint8Array | string, opts?: { encoding?: string }) => void;
  readFile: (path: string, opts?: { encoding?: string }) => Uint8Array | string;
};

export type FSNode = {
  name: string;
  size: number;
  mode: number;
  /** Used by MEMFS for stat().size on regular files */
  usedBytes?: number;
  /** Custom sync handle stored on the node for device-backed files */
  deviceHandle?: unknown;
  /** Stream operations override (replaces MEMFS default ops) */
  stream_ops?: DeviceOps;
};

export type FSStream = {
  fd: number;
  node: FSNode;
  position: number;
  flags: number;
};

export type DeviceOps = {
  open?: (stream: FSStream) => void;
  close?: (stream: FSStream) => void;
  read?: (
    stream: FSStream,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ) => number;
  write?: (
    stream: FSStream,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ) => number;
  llseek?: (stream: FSStream, offset: number, whence: number) => number;
};

// ============================================================================
// Constants
// ============================================================================

/** File mode: regular file (S_IFREG) */
export const S_IFREG = 32768;

/** File mode: read/write for all (0o666) */
export const MODE_RW_ALL = 438;

/** Seek from beginning of file */
export const SEEK_SET = 0;

/** Seek from current position */
export const SEEK_CUR = 1;

/** Seek from end of file */
export const SEEK_END = 2;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate new position for llseek operation.
 */
export function calculateSeekPosition(
  currentPosition: number,
  fileSize: number,
  offset: number,
  whence: number
): number {
  let newPosition: number;

  switch (whence) {
    case SEEK_SET:
      newPosition = offset;
      break;
    case SEEK_CUR:
      newPosition = currentPosition + offset;
      break;
    case SEEK_END:
      newPosition = fileSize + offset;
      break;
    default:
      throw new Error(`Invalid whence value: ${whence}`);
  }

  if (newPosition < 0) {
    throw new Error("Seek position cannot be negative");
  }

  return newPosition;
}

/**
 * Parse a path into directory parts and filename.
 */
export function parsePath(relativePath: string): { dirParts: string[]; fileName: string } {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || "";
  const dirParts = parts.slice(0, -1);
  return { dirParts, fileName };
}

/**
 * Get parent directory path from a relative path.
 */
export function getParentPath(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

/**
 * Get filename from a path.
 */
export function getFileName(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}
