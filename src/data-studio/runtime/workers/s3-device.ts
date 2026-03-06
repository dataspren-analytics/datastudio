/**
 * S3 Storage Device
 *
 * Pure storage backend using S3-compatible object storage.
 * This device knows NOTHING about Emscripten - it's just storage.
 *
 * Uses aws4fetch for SigV4-signed requests directly from the Web Worker.
 * Requires CORS to be configured on the S3 bucket.
 *
 * Usage:
 *   const s3Device = createS3Device({ accessKeyId, secretAccessKey, endpoint, region, bucket });
 *   await s3Device.init();
 *   const data = await s3Device.readFile("path/to/file.csv");
 */

import { AwsClient } from "aws4fetch";
import {
  type FileInfo,
  type FileStat,
  type ISyncFileHandle,
  type IStorageDevice,
  getParentPath,
  getFileName,
} from "./device";
import type { S3SyncBridge } from "./s3-sync-bridge";

// ============================================================================
// Types
// ============================================================================

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // e.g. "https://fsn1.your-objectstorage.com"
  region: string; // e.g. "fsn1"
  bucket: string; // e.g. "my-bucket"
}

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = "[S3Device]";

// ============================================================================
// XML Helpers (DOMParser unavailable in workers)
// ============================================================================

function extractXmlValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function extractXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// ============================================================================
// S3 Device Implementation
// ============================================================================

/**
 * Create an S3-backed storage device.
 *
 * This is a PURE STORAGE device - no Emscripten knowledge.
 * The VirtualFS layer handles Emscripten integration.
 *
 * Requires CORS to be configured on the S3 bucket.
 */
export function createS3Device(config: S3Config, syncBridge?: S3SyncBridge): IStorageDevice {
  let initialized = false;
  let aws: AwsClient;
  let baseUrl: string;

  // Cache of file sizes for sync handle creation (populated during listAllFiles)
  const fileSizeCache = new Map<string, number>();

  function ensureInitialized(): void {
    if (!initialized) {
      throw new Error("S3 device not initialized. Call init() first.");
    }
  }

  /** Build the S3 URL for a key, with optional query params. */
  function buildUrl(
    key: string,
    queryParams?: Record<string, string>,
  ): string {
    const encodedKey = key
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join("/");
    const path = encodedKey ? `${baseUrl}/${encodedKey}` : baseUrl;
    const qs = queryParams
      ? "?" + new URLSearchParams(queryParams).toString()
      : "";
    return `${path}${qs}`;
  }

  /** Signed fetch to S3. */
  async function s3Fetch(
    method: string,
    key: string,
    options?: {
      queryParams?: Record<string, string>;
      body?: ArrayBuffer;
    },
  ): Promise<Response> {
    const url = buildUrl(key, options?.queryParams);
    return aws.fetch(url, {
      method,
      body: options?.body || undefined,
    });
  }

  /**
   * List all objects in the bucket (handles pagination).
   */
  async function listObjects(
    prefix?: string,
  ): Promise<Array<{ key: string; size: number; lastModified?: number }>> {
    const objects: Array<{
      key: string;
      size: number;
      lastModified?: number;
    }> = [];
    let continuationToken: string | undefined;

    do {
      const queryParams: Record<string, string> = { "list-type": "2" };
      if (prefix) queryParams["prefix"] = prefix;
      if (continuationToken)
        queryParams["continuation-token"] = continuationToken;

      const response = await s3Fetch("GET", "", { queryParams });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `S3 ListObjects failed (${response.status}): ${body}`,
        );
      }

      const xml = await response.text();

      const contents = extractXmlBlocks(xml, "Contents");
      for (const content of contents) {
        const key = extractXmlValues(content, "Key")[0];
        if (!key) continue;
        if (key.endsWith("/")) continue;

        const sizeStr = extractXmlValues(content, "Size")[0];
        const lastModifiedStr = extractXmlValues(content, "LastModified")[0];

        objects.push({
          key,
          size: sizeStr ? parseInt(sizeStr, 10) : 0,
          lastModified: lastModifiedStr
            ? new Date(lastModifiedStr).getTime()
            : undefined,
        });
      }

      const isTruncated =
        extractXmlValues(xml, "IsTruncated")[0] === "true";
      continuationToken = isTruncated
        ? extractXmlValues(xml, "NextContinuationToken")[0]
        : undefined;
    } while (continuationToken);

    return objects;
  }

  return {
    async init(): Promise<void> {
      if (initialized) {
        console.warn(LOG_PREFIX, "Already initialized");
        return;
      }

      console.log(LOG_PREFIX, "Initializing S3 device (aws4fetch)");

      if (!config.accessKeyId || !config.endpoint || !config.bucket) {
        throw new Error(
          "S3 config incomplete: need accessKeyId, endpoint, and bucket",
        );
      }

      aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1",
        service: "s3",
      });

      // Path-style URL: https://{endpoint}/{bucket}
      const endpoint = config.endpoint.replace(/\/+$/, "");
      baseUrl = `${endpoint}/${config.bucket}`;

      // Verify S3 is reachable
      const response = await s3Fetch("GET", "", {
        queryParams: { "list-type": "2", "max-keys": "1" },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `S3 connectivity check failed (${response.status}): ${body}`,
        );
      }
      await response.text();

      initialized = true;
      console.log(LOG_PREFIX, "Initialized successfully");
    },

    // ========== File Operations ==========

    async writeFile(relativePath: string, data: ArrayBuffer): Promise<void> {
      ensureInitialized();
      console.log(
        LOG_PREFIX,
        `Writing file: ${relativePath} (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`,
      );

      const response = await s3Fetch("PUT", relativePath, { body: data });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `S3 PutObject failed for ${relativePath} (${response.status}): ${body}`,
        );
      }

      // Update file size cache so subsequent openSyncHandle gets the correct size
      fileSizeCache.set(relativePath, data.byteLength);
      console.log(LOG_PREFIX, `File written: ${relativePath}`);
    },

    async readFile(relativePath: string): Promise<Uint8Array> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Reading file: ${relativePath}`);

      const response = await s3Fetch("GET", relativePath);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `S3 GetObject failed for ${relativePath} (${response.status}): ${body}`,
        );
      }

      const buffer = await response.arrayBuffer();
      console.log(
        LOG_PREFIX,
        `File read: ${relativePath} (${buffer.byteLength} bytes)`,
      );
      return new Uint8Array(buffer);
    },

    async deleteFile(relativePath: string): Promise<boolean> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Deleting file: ${relativePath}`);

      const response = await s3Fetch("DELETE", relativePath);
      if (!response.ok && response.status !== 204) {
        console.warn(
          LOG_PREFIX,
          `Failed to delete file: ${relativePath} (${response.status})`,
        );
        return false;
      }

      console.log(LOG_PREFIX, `File deleted: ${relativePath}`);
      return true;
    },

    async fileExists(relativePath: string): Promise<boolean> {
      ensureInitialized();

      try {
        const response = await s3Fetch("HEAD", relativePath);
        return response.ok;
      } catch {
        return false;
      }
    },

    // ========== Directory Operations ==========

    async createDirectory(relativePath: string): Promise<void> {
      ensureInitialized();
      const keepPath = relativePath.replace(/\/+$/, "") + "/.keep";
      console.log(LOG_PREFIX, `Creating directory: ${relativePath} (via ${keepPath})`);

      const response = await s3Fetch("PUT", keepPath, {
        body: new ArrayBuffer(0),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `S3 createDirectory failed for ${relativePath} (${response.status}): ${body}`,
        );
      }
    },

    async deleteDirectory(relativePath: string): Promise<boolean> {
      ensureInitialized();
      console.log(LOG_PREFIX, `Deleting directory: ${relativePath}`);

      const prefix = relativePath.endsWith("/")
        ? relativePath
        : relativePath + "/";
      const objects = await listObjects(prefix);

      for (const obj of objects) {
        await s3Fetch("DELETE", obj.key);
      }

      try {
        await s3Fetch("DELETE", prefix);
      } catch {
        // Ignore
      }

      console.log(
        LOG_PREFIX,
        `Directory deleted: ${relativePath} (${objects.length} objects removed)`,
      );
      return true;
    },

    async renameDirectory(
      _relativePath: string,
      _newName: string,
    ): Promise<void> {
      throw new Error(
        "S3 device does not support renameDirectory (prototype limitation)",
      );
    },

    // ========== Move/Rename Operations ==========

    async moveFile(sourcePath: string, targetDir: string): Promise<string> {
      ensureInitialized();
      const fileName = getFileName(sourcePath);
      if (!fileName) throw new Error(`Invalid source path: ${sourcePath}`);

      const newRelativePath = targetDir
        ? `${targetDir}/${fileName}`
        : fileName;
      console.log(
        LOG_PREFIX,
        `Moving file: ${sourcePath} → ${newRelativePath}`,
      );

      const data = await this.readFile(sourcePath);
      await this.writeFile(newRelativePath, data.buffer as ArrayBuffer);
      await this.deleteFile(sourcePath);

      console.log(
        LOG_PREFIX,
        `File moved: ${sourcePath} → ${newRelativePath}`,
      );
      return newRelativePath;
    },

    async renameFile(
      relativePath: string,
      newName: string,
    ): Promise<string> {
      ensureInitialized();
      const parentPath = getParentPath(relativePath);
      const newRelativePath = parentPath
        ? `${parentPath}/${newName}`
        : newName;
      console.log(
        LOG_PREFIX,
        `Renaming file: ${relativePath} → ${newRelativePath}`,
      );

      const data = await this.readFile(relativePath);
      await this.writeFile(newRelativePath, data.buffer as ArrayBuffer);
      await this.deleteFile(relativePath);

      console.log(
        LOG_PREFIX,
        `File renamed: ${relativePath} → ${newRelativePath}`,
      );
      return newRelativePath;
    },

    // ========== Listing & Metadata ==========

    async listAllFiles(): Promise<FileInfo[]> {
      ensureInitialized();
      console.log(LOG_PREFIX, "Listing all files from S3...");

      const objects = await listObjects();
      const files: FileInfo[] = [];
      const seenDirs = new Set<string>();

      for (const obj of objects) {
        const parts = obj.key.split("/");
        const fileName = parts[parts.length - 1];

        for (let i = 1; i < parts.length; i++) {
          const dirPath = parts.slice(0, i).join("/");
          if (!seenDirs.has(dirPath)) {
            seenDirs.add(dirPath);
            files.push({
              name: parts[i - 1],
              path: dirPath,
              size: 0,
              isDirectory: true,
            });
          }
        }

        // Hide .keep files — they're only directory markers
        if (fileName === ".keep") continue;

        files.push({
          name: fileName,
          path: obj.key,
          size: obj.size,
          isDirectory: false,
        });

        // Cache file size for sync handle creation
        fileSizeCache.set(obj.key, obj.size);
      }

      console.log(
        LOG_PREFIX,
        `Found ${objects.length} files (+ ${seenDirs.size} directories) in S3`,
      );
      return files;
    },

    async stat(relativePath: string): Promise<FileStat | null> {
      ensureInitialized();

      if (!relativePath) {
        return { size: 0, isDirectory: true };
      }

      try {
        const response = await s3Fetch("HEAD", relativePath);
        if (response.ok) {
          const size = parseInt(
            response.headers.get("content-length") || "0",
            10,
          );
          const lastModified = response.headers.get("last-modified");
          return {
            size,
            isDirectory: false,
            mtime: lastModified
              ? new Date(lastModified).getTime()
              : undefined,
          };
        }
      } catch {
        // Not a file
      }

      try {
        const objects = await listObjects(relativePath + "/");
        if (objects.length > 0) {
          return { size: 0, isDirectory: true };
        }
      } catch {
        // Not a directory either
      }

      return null;
    },

    // ========== Sync Access (via S3SyncBridge) ==========

    async openSyncHandle(relativePath: string): Promise<ISyncFileHandle | null> {
      if (!syncBridge) return null;

      // Get file size from cache or via HEAD request
      let fileSize = fileSizeCache.get(relativePath);
      if (fileSize === undefined) {
        const fileStat = await this.stat(relativePath);
        if (!fileStat || fileStat.isDirectory) return null;
        fileSize = fileStat.size;
        fileSizeCache.set(relativePath, fileSize);
      }

      return syncBridge.createSyncHandle(relativePath, fileSize);
    },

    async closeSyncHandle(_relativePath: string): Promise<void> {
      // No-op for S3 (sync handles are stateless, bridge is shared)
    },

    // ========== Lifecycle ==========

    dispose(): void {
      console.log(LOG_PREFIX, "Disposed");
      initialized = false;
      fileSizeCache.clear();
    },
  };
}
