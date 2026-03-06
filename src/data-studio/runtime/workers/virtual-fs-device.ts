/**
 * Virtual Filesystem Device
 *
 * A multiplexing layer that:
 * 1. Mounts multiple storage backends at different paths
 * 2. Routes file operations to the appropriate underlying device
 * 3. Handles ALL Emscripten integration (device nodes, registration)
 *
 * Storage devices (OPFS, S3, etc.) are PURE STORAGE - they know nothing about Emscripten.
 * The VFS is the ONLY place that touches Emscripten's FS.
 *
 * Example:
 *   const vfs = createVirtualFSDevice(pyodide.FS);
 *   await vfs.init("/mnt");
 *
 *   // Mount OPFS at /mnt/local
 *   const opfs = createOPFSDevice();
 *   await opfs.init();
 *   await vfs.mountDevice("local", opfs);
 *
 *   // All operations go through VFS:
 *   await vfs.writeFile("local/data.csv", buffer);
 *
 *   // In Python:
 *   pd.read_csv("/mnt/local/data.csv")
 */

import {
  type DeviceOps,
  type EmscriptenFS,
  type FSStream,
  type FileInfo,
  type FileStat,
  type ISyncFileHandle,
  type IStorageDevice,
  calculateSeekPosition,
} from "./device";

// ============================================================================
// Types
// ============================================================================

/**
 * A mounted device with its mount point.
 */
interface MountedDevice {
  /** Path relative to VFS root where device is mounted (e.g., "local", "s3-bucket1") */
  subPath: string;
  /** The underlying storage device */
  device: IStorageDevice;
}


/**
 * Extended interface for VirtualFSDevice with device mounting capabilities.
 */
export interface IVirtualFSDevice {
  /**
   * Initialize the VFS at a mount path.
   * @param path - The Emscripten path to mount at (e.g., "/mnt")
   */
  init(path: string): Promise<void>;

  /**
   * Mount a storage device at a sub-path.
   * The device will handle all files under this path.
   * Device must already be initialized.
   *
   * @param subPath - Path relative to VFS mount (e.g., "local", "s3-bucket1")
   * @param device - The storage device to mount (must already be initialized)
   */
  mountDevice(subPath: string, device: IStorageDevice): Promise<void>;

  /**
   * Unmount a device from a sub-path.
   * @param subPath - The sub-path to unmount
   */
  unmountDevice(subPath: string): void;

  /**
   * List all mounted devices.
   * @returns Array of [subPath, device] tuples
   */
  listMountedDevices(): Array<[string, IStorageDevice]>;

  /**
   * Get the device responsible for a given file path.
   * @param filePath - Path relative to VFS mount (e.g., "local/file.csv")
   * @returns The device and the path relative to that device, or null if no device handles this path
   */
  resolveDevice(filePath: string): { device: IStorageDevice; relativePath: string } | null;

  // ========== File Operations (routes to devices) ==========

  writeFile(filePath: string, data: ArrayBuffer): Promise<void>;
  readFile(filePath: string): Promise<Uint8Array>;
  deleteFile(filePath: string): Promise<boolean>;
  fileExists(filePath: string): Promise<boolean>;

  // ========== Directory Operations ==========

  createDirectory(filePath: string): Promise<void>;
  deleteDirectory(filePath: string): Promise<boolean>;
  renameDirectory(filePath: string, newName: string): Promise<void>;

  // ========== Move/Rename Operations ==========

  moveFile(sourcePath: string, targetDir: string): Promise<string>;
  renameFile(filePath: string, newName: string): Promise<string>;

  // ========== Listing & Metadata ==========

  listAllFiles(): Promise<FileInfo[]>;
  stat(filePath: string): Promise<FileStat | null>;

  // ========== Lazy File Loading ==========

  /**
   * Ensure a file is ready for use in Emscripten (downloaded and registered).
   * For lazy files (e.g., S3), this downloads the content and registers in MEMFS.
   * For already-registered files, this is a no-op.
   * @param filePath - Path relative to VFS mount (e.g., "public_bucket/file.parquet")
   */
  ensureFileReady(filePath: string): Promise<void>;

  /**
   * Get all lazy file paths (files listed but not yet downloaded).
   * Returns full Emscripten paths (e.g., "/mnt/public_bucket/file.parquet").
   */
  getLazyFilePaths(): string[];

  // ========== Handle Lifecycle (multi-tab OPFS support) ==========

  /**
   * Close all OPFS sync handles so other tabs can access files.
   * Emscripten nodes remain but with null handles — any sync read/write
   * will fail until resumeHandles() is called.
   */
  suspendHandles(): Promise<void>;

  /**
   * Reopen all previously suspended sync handles.
   * Must be called before executing code that may read files via Emscripten.
   */
  resumeHandles(): Promise<void>;

  // ========== Lifecycle ==========

  getMountPath(): string | null;
  dispose(): void;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = "[VirtualFS]";

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a virtual filesystem device that can mount multiple storage backends.
 *
 * @param FS - Emscripten's filesystem object (pyodide.FS)
 * @returns A virtual filesystem device
 */
export function createVirtualFSDevice(FS: EmscriptenFS): IVirtualFSDevice {
  let rootMountPath: string | null = null;

  const mountedDevices = new Map<string, MountedDevice>();

  /**
   * Resolve a file path to its handling device.
   * Path format: "subPath/fileName" (e.g., "local/data.csv", "s3-bucket1/file.parquet")
   */
  function resolveDeviceInternal(
    filePath: string
  ): { mounted: MountedDevice; relativePath: string; subPath: string } | null {
    // Normalize path
    const normalizedPath = filePath.replace(/^\/+|\/+$/g, "");

    // Find the device with the longest matching prefix
    let bestMatch: { mounted: MountedDevice; relativePath: string; subPath: string } | null = null;
    let bestMatchLength = 0;

    for (const [subPath, mounted] of mountedDevices) {
      if (normalizedPath === subPath || normalizedPath.startsWith(subPath + "/")) {
        if (subPath.length > bestMatchLength) {
          bestMatchLength = subPath.length;
          const relativePath = normalizedPath === subPath ? "" : normalizedPath.slice(subPath.length + 1);
          bestMatch = { mounted, relativePath, subPath };
        }
      }
    }

    return bestMatch;
  }

  function ensureResolved(filePath: string): { mounted: MountedDevice; relativePath: string; subPath: string } {
    const resolved = resolveDeviceInternal(filePath);
    if (!resolved) {
      throw new Error(
        `No device mounted for path: ${filePath}. ` +
        `Available mounts: ${Array.from(mountedDevices.keys()).join(", ") || "(none)"}`
      );
    }
    return resolved;
  }

  function ensureInitialized(): void {
    if (!rootMountPath) {
      throw new Error("VirtualFS not initialized. Call init() first.");
    }
  }

  // Lazy files: listed but not yet downloaded (S3 files registered during mount)
  const lazyFiles = new Map<string, { mounted: MountedDevice; relativePath: string; size: number }>();

  // Per-file write locks to prevent concurrent createSyncAccessHandle calls
  const writeLocks = new Map<string, Promise<void>>();

  // Track device-backed files for suspend/resume (OPFS multi-tab support).
  // Maps fullVFSPath → { mounted, relativePath } for files with sync handles.
  const deviceBackedFiles = new Map<string, { mounted: MountedDevice; relativePath: string }>();
  let handlesSuspended = false;

  /**
   * Shared stream ops for device-backed file nodes.
   * These override MEMFS default ops to delegate to OPFS sync access handles.
   * The node appears as a regular file (S_IFREG) so DuckDB/Python treat it normally,
   * but reads/writes go directly through the sync handle — zero memory copy.
   */
  const syncDeviceStreamOps: DeviceOps = {
    open(_stream: FSStream) {
      // Handle is already set on node.deviceHandle during registration
    },
    close(_stream: FSStream) {
      // Don't close the handle - VFS manages handle lifecycle
    },
    read(stream: FSStream, buffer: Uint8Array, offset: number, length: number, position: number) {
      const handle = stream.node.deviceHandle as ISyncFileHandle;
      if (!handle) throw new Error("No device handle available for read");
      return handle.read(buffer.subarray(offset, offset + length), { at: position });
    },
    write(stream: FSStream, buffer: Uint8Array, offset: number, length: number, position: number) {
      const handle = stream.node.deviceHandle as ISyncFileHandle;
      if (!handle) throw new Error("No device handle available for write");
      const written = handle.write(buffer.subarray(offset, offset + length), { at: position });
      handle.flush();
      // Update node size in case write extended the file
      const newSize = handle.getSize();
      stream.node.usedBytes = newSize;
      return written;
    },
    llseek(stream: FSStream, offset: number, whence: number) {
      const handle = stream.node.deviceHandle as ISyncFileHandle;
      const size = handle ? handle.getSize() : 0;
      return calculateSeekPosition(stream.position, size, offset, whence);
    },
  };

  /**
   * Mount a file node in Emscripten FS.
   *
   * For devices with sync handle support (OPFS): creates a regular file node
   * with overridden stream_ops that delegate to the sync handle. No content
   * is copied into memory — reads/writes go directly through OPFS.
   *
   * For other devices: falls back to copying content into MEMFS.
   */
  async function mountFileNode(
    mounted: MountedDevice,
    relativePath: string
  ): Promise<void> {
    const fullVFSPath = `${rootMountPath}/${mounted.subPath}/${relativePath}`;

    // Clean up any existing registration
    unmountFileNode(mounted, relativePath);

    // Ensure parent directories exist
    const pathParts = relativePath.split("/").filter(Boolean);
    if (pathParts.length > 1) {
      const parentPath = `${rootMountPath}/${mounted.subPath}/${pathParts.slice(0, -1).join("/")}`;
      FS.mkdirTree(parentPath);
    }

    // Try sync handle path (zero-copy, byte-range access)
    if (mounted.device.openSyncHandle) {
      const handle = await mounted.device.openSyncHandle(relativePath);
      if (handle) {
        const fileSize = handle.getSize();

        // Create an empty regular file as a placeholder node
        FS.writeFile(fullVFSPath, new Uint8Array(0));
        const node = FS.lookupPath(fullVFSPath).node;

        // Store handle and set correct size for stat()
        node.deviceHandle = handle;
        node.usedBytes = fileSize;

        // Override stream ops to delegate to sync handle
        node.stream_ops = syncDeviceStreamOps;

        // Track for suspend/resume
        deviceBackedFiles.set(fullVFSPath, { mounted, relativePath });

        console.log(LOG_PREFIX, `Registered device-backed file: ${fullVFSPath} (size=${fileSize})`);
        return;
      }
    }

    // Fallback: copy content to MEMFS
    const content = await mounted.device.readFile(relativePath);
    FS.writeFile(fullVFSPath, content);
    console.log(LOG_PREFIX, `Registered MEMFS file: ${fullVFSPath} (size=${content.length})`);
  }

  /**
   * Unmount a file node from Emscripten FS.
   * Removes the FS node and tells the device to close its sync handle.
   * The device is the sole handle owner.
   */
  function unmountFileNode(
    mounted: MountedDevice,
    relativePath: string
  ): void {
    const fullVFSPath = `${rootMountPath}/${mounted.subPath}/${relativePath}`;

    // Stop tracking for suspend/resume
    deviceBackedFiles.delete(fullVFSPath);

    // Remove from Emscripten FS first (prevents stale device ops)
    try {
      FS.unlink(fullVFSPath);
    } catch {
      // May not exist
    }

    // Tell the device to close its handle
    if (mounted.device.closeSyncHandle) {
      mounted.device.closeSyncHandle(relativePath);
    }
  }

  /**
   * Recursively scan a device and mount all files in Emscripten.
   *
   * For devices with sync handle support (OPFS): files are mounted with
   * device-backed nodes (zero-copy, byte-range access).
   *
   * For other devices (S3): files are tracked as "lazy" — only metadata is stored.
   * Content is fetched on-demand when files are actually accessed.
   */
  async function scanAndRegisterDevice(mounted: MountedDevice): Promise<void> {
    console.log(LOG_PREFIX, `Scanning device at ${mounted.subPath}...`);
    const files = await mounted.device.listAllFiles();
    const hasSyncHandleSupport = typeof mounted.device.openSyncHandle === "function";
    console.log(LOG_PREFIX, `Found ${files.length} files/directories (syncHandle=${hasSyncHandleSupport})`);

    // Create directories first (ensures parents exist before children)
    for (const file of files) {
      if (file.isDirectory) {
        const fullPath = `${rootMountPath}/${mounted.subPath}/${file.path}`;
        try {
          FS.mkdirTree(fullPath);
        } catch {
          // May already exist
        }
      }
    }

    // Register files
    let lazyCount = 0;
    for (const file of files) {
      if (!file.isDirectory) {
        if (hasSyncHandleSupport) {
          // Devices with sync handles: register with device nodes (zero-copy)
          try {
            await mountFileNode(mounted, file.path);
          } catch (e) {
            console.warn(LOG_PREFIX, `Failed to register file: ${file.path}`, e);
          }
        } else {
          // Devices without sync handles (S3): track as lazy (metadata only, no download)
          const fullVFSPath = `${rootMountPath}/${mounted.subPath}/${file.path}`;
          lazyFiles.set(fullVFSPath, { mounted, relativePath: file.path, size: file.size });
          lazyCount++;
        }
      }
    }

    if (lazyCount > 0) {
      console.log(LOG_PREFIX, `${lazyCount} files registered as lazy (on-demand) at ${mounted.subPath}`);
    }
    console.log(LOG_PREFIX, `Finished scanning device at ${mounted.subPath}`);
  }

  return {
    // ========== VFS Init ==========

    async init(path: string): Promise<void> {
      if (rootMountPath) {
        console.warn(LOG_PREFIX, `Already initialized at ${rootMountPath}`);
        return;
      }

      console.log(LOG_PREFIX, `Initializing at ${path}`);

      // Create mount directory in Emscripten FS
      FS.mkdirTree(path);

      rootMountPath = path;
      console.log(LOG_PREFIX, `Initialized successfully at ${path}`);
    },

    async mountDevice(subPath: string, device: IStorageDevice): Promise<void> {
      ensureInitialized();

      // Normalize subPath (remove leading/trailing slashes)
      const normalizedSubPath = subPath.replace(/^\/+|\/+$/g, "");

      if (mountedDevices.has(normalizedSubPath)) {
        console.warn(LOG_PREFIX, `Device already mounted at ${normalizedSubPath}, unmounting first`);
        this.unmountDevice(normalizedSubPath);
      }

      console.log(LOG_PREFIX, `Mounting device at ${rootMountPath}/${normalizedSubPath}`);

      // Create the subdirectory for this device in Emscripten FS
      const fullPath = `${rootMountPath}/${normalizedSubPath}`;
      FS.mkdirTree(fullPath);

      const mounted: MountedDevice = {
        subPath: normalizedSubPath,
        device,
      };
      mountedDevices.set(normalizedSubPath, mounted);

      // Scan device and register all existing files in Emscripten
      try {
        console.log(LOG_PREFIX, `Starting scanAndRegisterDevice...`);
        await scanAndRegisterDevice(mounted);
        console.log(LOG_PREFIX, `scanAndRegisterDevice completed`);
      } catch (e) {
        console.error(LOG_PREFIX, `Error in scanAndRegisterDevice:`, e);
        throw e;
      }

      console.log(LOG_PREFIX, `Device mounted at ${fullPath}`);
    },

    unmountDevice(subPath: string): void {
      const normalizedSubPath = subPath.replace(/^\/+|\/+$/g, "");
      const mounted = mountedDevices.get(normalizedSubPath);

      if (!mounted) {
        console.warn(LOG_PREFIX, `No device mounted at ${normalizedSubPath}`);
        return;
      }

      console.log(LOG_PREFIX, `Unmounting device at ${normalizedSubPath}`);

      // Clear lazy files for this device
      const prefix = `${rootMountPath}/${normalizedSubPath}/`;
      for (const path of lazyFiles.keys()) {
        if (path.startsWith(prefix)) {
          lazyFiles.delete(path);
        }
      }

      mounted.device.dispose();
      mountedDevices.delete(normalizedSubPath);
      console.log(LOG_PREFIX, `Device unmounted from ${normalizedSubPath}`);
    },

    listMountedDevices(): Array<[string, IStorageDevice]> {
      return Array.from(mountedDevices.entries()).map(([subPath, mounted]) => [
        subPath,
        mounted.device,
      ]);
    },

    resolveDevice(filePath: string): { device: IStorageDevice; relativePath: string } | null {
      const result = resolveDeviceInternal(filePath);
      if (!result) return null;
      return { device: result.mounted.device, relativePath: result.relativePath };
    },

    // ========== File Operations ==========

    async writeFile(filePath: string, data: ArrayBuffer): Promise<void> {
      ensureInitialized();
      const resolved = ensureResolved(filePath);
      const fullVFSPath = `${rootMountPath}/${resolved.subPath}/${resolved.relativePath}`;

      // Existing file with sync handle: write through it directly (no teardown).
      // The sync handle IS the underlying storage (e.g. OPFS SyncAccessHandle),
      // so writing + flushing persists data without any unmount/mount cycle.
      try {
        const node = FS.lookupPath(fullVFSPath).node;
        const handle = node.deviceHandle as ISyncFileHandle | null;
        if (handle) {
          handle.truncate(0);
          handle.write(new Uint8Array(data), { at: 0 });
          handle.flush();
          node.usedBytes = data.byteLength;
          return;
        }
      } catch {
        // Node doesn't exist — new file
      }

      // Slow path: serialize per file to prevent concurrent createSyncAccessHandle calls.
      // Two concurrent writes for the same new file would both try to create a sync
      // access handle, but OPFS only allows one at a time per file.
      const lockKey = fullVFSPath;
      const prev = writeLocks.get(lockKey) ?? Promise.resolve();

      const doWrite = async () => {
        // Re-check fast path — a previous queued write may have mounted the node
        try {
          const node = FS.lookupPath(fullVFSPath).node;
          const handle = node.deviceHandle as ISyncFileHandle | null;
          if (handle) {
            handle.truncate(0);
            handle.write(new Uint8Array(data), { at: 0 });
            handle.flush();
            node.usedBytes = data.byteLength;
            return;
          }
        } catch {
          // Still no node
        }

        await resolved.mounted.device.writeFile(resolved.relativePath, data);
        await mountFileNode(resolved.mounted, resolved.relativePath);
      };

      const current = prev.catch(() => {}).then(doWrite);
      writeLocks.set(lockKey, current);

      try {
        await current;
      } finally {
        if (writeLocks.get(lockKey) === current) {
          writeLocks.delete(lockKey);
        }
      }
    },

    async readFile(filePath: string): Promise<Uint8Array> {
      ensureInitialized();
      const resolved = ensureResolved(filePath);

      // If this is a lazy file, ensure it's downloaded first
      const fullVFSPath = `${rootMountPath}/${resolved.subPath}/${resolved.relativePath}`;
      if (lazyFiles.has(fullVFSPath)) {
        console.log(LOG_PREFIX, `readFile: lazy file ${filePath}, downloading on-demand...`);
        lazyFiles.delete(fullVFSPath);
        await mountFileNode(resolved.mounted, resolved.relativePath);
      }

      return resolved.mounted.device.readFile(resolved.relativePath);
    },

    async deleteFile(filePath: string): Promise<boolean> {
      ensureInitialized();
      const resolved = resolveDeviceInternal(filePath);
      if (!resolved) {
        console.warn(LOG_PREFIX, `No device found for path: ${filePath}`);
        return false;
      }
      console.log(LOG_PREFIX, `deleteFile: ${filePath} → device "${resolved.subPath}"`);

      // Remove from lazy tracking if present
      const fullVFSPath = `${rootMountPath}/${resolved.subPath}/${resolved.relativePath}`;
      lazyFiles.delete(fullVFSPath);

      // Unregister from Emscripten first
      unmountFileNode(resolved.mounted, resolved.relativePath);

      // Delete from storage
      return resolved.mounted.device.deleteFile(resolved.relativePath);
    },

    async fileExists(filePath: string): Promise<boolean> {
      const resolved = resolveDeviceInternal(filePath);
      if (!resolved) return false;
      return resolved.mounted.device.fileExists(resolved.relativePath);
    },

    // ========== Directory Operations ==========

    async createDirectory(filePath: string): Promise<void> {
      ensureInitialized();
      const resolved = ensureResolved(filePath);
      console.log(LOG_PREFIX, `createDirectory: ${filePath} → device "${resolved.subPath}"`);

      // Create in storage
      await resolved.mounted.device.createDirectory(resolved.relativePath);

      // Create in Emscripten FS
      const fullPath = `${rootMountPath}/${resolved.subPath}/${resolved.relativePath}`;
      FS.mkdirTree(fullPath);
    },

    async deleteDirectory(filePath: string): Promise<boolean> {
      ensureInitialized();
      const resolved = resolveDeviceInternal(filePath);
      if (!resolved) {
        console.warn(LOG_PREFIX, `No device found for path: ${filePath}`);
        return false;
      }
      console.log(LOG_PREFIX, `deleteDirectory: ${filePath} → device "${resolved.subPath}"`);

      // Delete from storage
      return resolved.mounted.device.deleteDirectory(resolved.relativePath);
    },

    async renameDirectory(filePath: string, newName: string): Promise<void> {
      ensureInitialized();
      const resolved = ensureResolved(filePath);
      console.log(LOG_PREFIX, `renameDirectory: ${filePath} → ${newName}`);

      // Calculate old and new paths
      const oldFullPath = `${rootMountPath}/${resolved.subPath}/${resolved.relativePath}`;
      const pathParts = resolved.relativePath.split("/").filter(Boolean);
      pathParts.pop();
      const newRelativePath = pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName;
      const newFullPath = `${rootMountPath}/${resolved.subPath}/${newRelativePath}`;

      // Rename in storage first
      await resolved.mounted.device.renameDirectory(resolved.relativePath, newName);

      // Remove old directory from Emscripten FS (recursively)
      try {
        const removeRecursive = (path: string) => {
          try {
            const stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
              const entries = FS.readdir(path).filter((e: string) => e !== "." && e !== "..");
              for (const entry of entries) {
                removeRecursive(`${path}/${entry}`);
              }
              FS.rmdir(path);
            } else {
              FS.unlink(path);
            }
          } catch {
            // Path doesn't exist, that's fine
          }
        };
        removeRecursive(oldFullPath);
      } catch (e) {
        console.warn(LOG_PREFIX, `Failed to remove old directory from Emscripten FS: ${oldFullPath}`, e);
      }

      // Re-register all files from the renamed directory
      const files = await resolved.mounted.device.listAllFiles();
      for (const file of files) {
        if (file.path.startsWith(newRelativePath + "/") || file.path === newRelativePath) {
          if (!file.isDirectory) {
            await mountFileNode(resolved.mounted, file.path);
          } else {
            // Create directory in Emscripten
            const dirPath = `${rootMountPath}/${resolved.subPath}/${file.path}`;
            FS.mkdirTree(dirPath);
          }
        }
      }

      console.log(LOG_PREFIX, `Directory renamed and re-registered: ${oldFullPath} → ${newFullPath}`);
    },

    // ========== Move/Rename Operations ==========

    async moveFile(sourcePath: string, targetDir: string): Promise<string> {
      ensureInitialized();

      const sourceResolved = ensureResolved(sourcePath);
      const targetResolved = ensureResolved(targetDir);

      console.log(LOG_PREFIX, `moveFile: ${sourcePath} → ${targetDir}`);

      if (sourceResolved.subPath !== targetResolved.subPath) {
        // Cross-device move: read from source, write to target, delete from source
        const fileName = sourcePath.split("/").filter(Boolean).pop() || "";
        const newRelativePath = targetResolved.relativePath
          ? `${targetResolved.relativePath}/${fileName}`
          : fileName;

        console.log(LOG_PREFIX, `Cross-device move: ${sourceResolved.subPath} → ${targetResolved.subPath}`);

        // Unregister source from Emscripten
        unmountFileNode(sourceResolved.mounted, sourceResolved.relativePath);

        const data = await sourceResolved.mounted.device.readFile(sourceResolved.relativePath);
        await targetResolved.mounted.device.writeFile(newRelativePath, data.buffer as ArrayBuffer);
        await sourceResolved.mounted.device.deleteFile(sourceResolved.relativePath);

        // Register at new location
        await mountFileNode(targetResolved.mounted, newRelativePath);

        return `${targetResolved.subPath}/${newRelativePath}`;
      }

      // Same-device move
      unmountFileNode(sourceResolved.mounted, sourceResolved.relativePath);

      const newRelativePath = await sourceResolved.mounted.device.moveFile(
        sourceResolved.relativePath,
        targetResolved.relativePath
      );

      await mountFileNode(sourceResolved.mounted, newRelativePath);

      return `${sourceResolved.subPath}/${newRelativePath}`;
    },

    async renameFile(filePath: string, newName: string): Promise<string> {
      ensureInitialized();
      const resolved = ensureResolved(filePath);
      console.log(LOG_PREFIX, `renameFile: ${filePath} → ${newName}`);

      // Unregister from Emscripten
      unmountFileNode(resolved.mounted, resolved.relativePath);

      // Rename in storage
      const newRelativePath = await resolved.mounted.device.renameFile(resolved.relativePath, newName);

      // Register at new location
      await mountFileNode(resolved.mounted, newRelativePath);

      return `${resolved.subPath}/${newRelativePath}`;
    },

    // ========== Listing & Metadata ==========

    async listAllFiles(): Promise<FileInfo[]> {
      ensureInitialized();
      const allFiles: FileInfo[] = [];

      for (const [subPath, mounted] of mountedDevices) {
        // Include the mount point itself as a directory entry
        allFiles.push({
          name: subPath,
          path: subPath,
          size: 0,
          isDirectory: true,
        });

        const deviceFiles = await mounted.device.listAllFiles();
        // Prefix paths with subPath
        for (const file of deviceFiles) {
          allFiles.push({
            ...file,
            path: `${subPath}/${file.path}`,
          });
        }
      }

      return allFiles;
    },

    async stat(filePath: string): Promise<FileStat | null> {
      ensureInitialized();
      const resolved = resolveDeviceInternal(filePath);
      if (!resolved) return null;
      return resolved.mounted.device.stat(resolved.relativePath);
    },

    // ========== Lazy File Loading ==========

    async ensureFileReady(filePath: string): Promise<void> {
      ensureInitialized();
      const normalizedPath = filePath.replace(/^\/+|\/+$/g, "");
      const fullVFSPath = `${rootMountPath}/${normalizedPath}`;

      const lazy = lazyFiles.get(fullVFSPath);
      if (!lazy) return; // Already downloaded or not a lazy file

      console.log(LOG_PREFIX, `ensureFileReady: downloading ${fullVFSPath}...`);
      lazyFiles.delete(fullVFSPath);
      await mountFileNode(lazy.mounted, lazy.relativePath);
    },

    getLazyFilePaths(): string[] {
      return Array.from(lazyFiles.keys());
    },

    // ========== Handle Lifecycle (multi-tab OPFS support) ==========

    async suspendHandles(): Promise<void> {
      if (handlesSuspended) return;

      for (const [fullVFSPath, { mounted, relativePath }] of deviceBackedFiles) {
        // Null out the Emscripten node's handle
        try {
          const node = FS.lookupPath(fullVFSPath).node;
          node.deviceHandle = null;
        } catch {
          // Node may not exist
        }

        // Close the device's sync handle
        if (mounted.device.closeSyncHandle) {
          await mounted.device.closeSyncHandle(relativePath);
        }
      }

      handlesSuspended = true;
      console.log(LOG_PREFIX, `Suspended ${deviceBackedFiles.size} sync handles`);
    },

    async resumeHandles(): Promise<void> {
      if (!handlesSuspended) return;

      const toRemove: string[] = [];
      let contended: string[] = [];

      for (const [fullVFSPath, { mounted, relativePath }] of deviceBackedFiles) {
        if (!mounted.device.openSyncHandle) continue;

        const handle = await mounted.device.openSyncHandle(relativePath);
        if (handle) {
          try {
            const node = FS.lookupPath(fullVFSPath).node;
            node.deviceHandle = handle;
            node.usedBytes = handle.getSize();
          } catch {
            toRemove.push(fullVFSPath);
          }
        } else {
          // Distinguish "file deleted" from "handle locked by another tab"
          const exists = await mounted.device.fileExists(relativePath);
          if (exists) {
            contended.push(fullVFSPath);
          } else {
            toRemove.push(fullVFSPath);
          }
        }
      }

      // Retry contended files — the other tab may release handles shortly
      if (contended.length > 0) {
        console.log(LOG_PREFIX, `${contended.length} files locked by another tab, retrying...`);
        for (let attempt = 0; attempt < 3 && contended.length > 0; attempt++) {
          await new Promise(r => setTimeout(r, 1000));
          const stillContended: string[] = [];
          for (const fullVFSPath of contended) {
            const entry = deviceBackedFiles.get(fullVFSPath);
            if (!entry?.mounted.device.openSyncHandle) continue;

            const handle = await entry.mounted.device.openSyncHandle(entry.relativePath);
            if (handle) {
              try {
                const node = FS.lookupPath(fullVFSPath).node;
                node.deviceHandle = handle;
                node.usedBytes = handle.getSize();
              } catch {
                toRemove.push(fullVFSPath);
              }
            } else {
              stillContended.push(fullVFSPath);
            }
          }
          contended = stillContended;
        }

        if (contended.length > 0) {
          console.warn(LOG_PREFIX, `${contended.length} files still locked by another tab after retries`);
        }
      }

      // Only remove files that were truly deleted
      for (const path of toRemove) {
        deviceBackedFiles.delete(path);
        try { FS.unlink(path); } catch { /* may not exist */ }
      }

      handlesSuspended = false;
      const resumed = deviceBackedFiles.size - contended.length - toRemove.length;
      if (toRemove.length > 0 || contended.length > 0) {
        console.log(LOG_PREFIX, `Resumed ${resumed} handles (${toRemove.length} deleted, ${contended.length} still locked)`);
      } else {
        console.log(LOG_PREFIX, `Resumed ${deviceBackedFiles.size} sync handles`);
      }
    },

    // ========== Lifecycle ==========

    getMountPath(): string | null {
      return rootMountPath;
    },

    dispose(): void {
      console.log(LOG_PREFIX, `Disposing VirtualFS`);

      for (const [subPath, mounted] of mountedDevices) {
        try {
          mounted.device.dispose();
          console.log(LOG_PREFIX, `Disposed device at ${subPath}`);
        } catch (e) {
          console.warn(LOG_PREFIX, `Failed to dispose device at ${subPath}:`, e);
        }
      }

      lazyFiles.clear();
      mountedDevices.clear();
      rootMountPath = null;

      console.log(LOG_PREFIX, `Disposed`);
    },
  };
}
