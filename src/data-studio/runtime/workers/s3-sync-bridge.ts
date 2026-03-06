/**
 * S3 Sync Bridge
 *
 * Provides synchronous byte-range reads from S3 using a helper worker
 * and SharedArrayBuffer + Atomics. This bridges the gap between
 * Emscripten's synchronous filesystem callbacks and async S3 HTTP fetches.
 *
 * Architecture:
 *   Pyodide Worker                Helper Worker
 *   ─────────────                ──────────────
 *   DuckDB read() callback       aws4fetch Range GET
 *        │                              ▲
 *        ▼                              │
 *   Atomics.wait() ◄──SharedArrayBuffer──► Atomics.notify()
 *        │                              │
 *        ▼                              │
 *   return bytes                  write to shared buffer
 *
 * Requires cross-origin isolation (COOP/COEP headers) for SharedArrayBuffer.
 */

import type { ISyncFileHandle } from "./device";

// Status constants (must match s3-sync-bridge.worker.ts)
const STATUS_IDLE = 0;
const STATUS_REQUEST = 1;
// STATUS_RESPONSE_OK = 2 (checked implicitly — any non-error status after wait is success)
const STATUS_RESPONSE_ERROR = 3;

// Buffer sizes
const CONTROL_BUFFER_SIZE = 32; // 8 Int32 slots
const DATA_BUFFER_SIZE = 16 * 1024 * 1024; // 16MB max per read

const LOG_PREFIX = "[S3SyncBridge]";

export interface S3SyncBridgeConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
}

/**
 * Check if SharedArrayBuffer is available (requires cross-origin isolation).
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

// Read-ahead size: fetch at least this many bytes per HTTP request.
// Parquet readers scan headers/footers byte-by-byte via Emscripten,
// so without read-ahead each byte becomes a separate HTTP round-trip.
const READ_AHEAD_SIZE = 256 * 1024; // 256KB

/**
 * Synchronous file handle for S3 files, backed by the sync bridge.
 * Each handle represents a single S3 object with known size.
 *
 * Includes a read-ahead cache: when a small read arrives (e.g. 1 byte),
 * we fetch a larger chunk and serve subsequent sequential reads from memory.
 */
class S3SyncHandle implements ISyncFileHandle {
  private cache: Uint8Array | null = null;
  private cacheStart = 0;
  private cacheEnd = 0;

  constructor(
    private bridge: S3SyncBridge,
    private filePath: string,
    private fileSize: number,
  ) {}

  read(buffer: Uint8Array, options?: { at?: number }): number {
    const position = options?.at ?? 0;
    const length = buffer.length;

    // EOF guard — reading at or past the end of the file
    if (this.fileSize <= 0 || position >= this.fileSize) {
      return 0;
    }

    // Serve from cache if the requested range is fully within it
    if (this.cache && position >= this.cacheStart && position + length <= this.cacheEnd) {
      const offset = position - this.cacheStart;
      buffer.set(this.cache.subarray(offset, offset + length));
      return length;
    }

    // Fetch with read-ahead: request at least READ_AHEAD_SIZE bytes
    const fetchLength = Math.min(
      Math.max(length, READ_AHEAD_SIZE),
      this.fileSize - position,  // don't read past EOF
      DATA_BUFFER_SIZE,          // don't exceed shared buffer
    );

    if (fetchLength <= 0) return 0;

    const fetchBuffer = new Uint8Array(fetchLength);
    const bytesRead = this.bridge.syncRead(this.filePath, fetchBuffer, position);

    // Update cache
    this.cache = fetchBuffer.subarray(0, bytesRead);
    this.cacheStart = position;
    this.cacheEnd = position + bytesRead;

    // Copy the originally requested portion
    const toCopy = Math.min(length, bytesRead);
    buffer.set(this.cache.subarray(0, toCopy));
    return toCopy;
  }

  write(_buffer: Uint8Array, _options?: { at?: number }): number {
    throw new Error("S3 files are read-only via sync handle");
  }

  truncate(_newSize: number): void {
    throw new Error("S3 files are read-only via sync handle");
  }

  getSize(): number {
    return this.fileSize;
  }

  flush(): void {
    // No-op for S3
  }

  close(): void {
    this.cache = null;
  }
}

/**
 * S3 Sync Bridge — manages the helper worker and SharedArrayBuffer.
 *
 * Usage:
 *   const bridge = new S3SyncBridge(s3Config);
 *   await bridge.init();
 *   const handle = bridge.createSyncHandle("path/to/file.parquet", fileSize);
 *   const bytesRead = handle.read(buffer, { at: offset });
 */
export class S3SyncBridge {
  private worker: Worker | null = null;
  private controlBuffer: SharedArrayBuffer;
  private dataBuffer: SharedArrayBuffer;
  private controlView: Int32Array;
  private dataView: Uint8Array;
  private ready = false;

  constructor(private config: S3SyncBridgeConfig) {
    this.controlBuffer = new SharedArrayBuffer(CONTROL_BUFFER_SIZE);
    this.dataBuffer = new SharedArrayBuffer(DATA_BUFFER_SIZE);
    this.controlView = new Int32Array(this.controlBuffer);
    this.dataView = new Uint8Array(this.dataBuffer);
  }

  /**
   * Initialize the bridge by creating the helper worker.
   * Must be called before any reads.
   */
  async init(): Promise<void> {
    if (this.ready) return;

    console.log(LOG_PREFIX, "Creating helper worker...");

    this.worker = new Worker(
      new URL("./s3-sync-bridge.worker.ts", import.meta.url),
      { type: "module" },
    );

    // Wait for the worker to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("S3 sync bridge worker init timeout"));
      }, 10000);

      this.worker!.onmessage = (event) => {
        if (event.data.type === "ready") {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.worker!.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error(`S3 sync bridge worker error: ${error.message}`));
      };

      // Send init message with shared buffers
      this.worker!.postMessage({
        type: "init",
        s3Config: this.config,
        controlBuffer: this.controlBuffer,
        dataBuffer: this.dataBuffer,
      });
    });

    this.ready = true;
    console.log(LOG_PREFIX, "Helper worker ready");
  }

  /**
   * Create a synchronous file handle for an S3 object.
   */
  createSyncHandle(filePath: string, fileSize: number): ISyncFileHandle {
    return new S3SyncHandle(this, filePath, fileSize);
  }

  /**
   * Perform a synchronous byte-range read from S3.
   * Blocks the calling thread via Atomics.wait until data arrives.
   *
   * @param filePath - S3 object key (relative to bucket)
   * @param buffer - Output buffer to write data into
   * @param position - Byte offset in the file to read from
   * @returns Number of bytes actually read
   */
  syncRead(filePath: string, buffer: Uint8Array, position: number): number {
    if (!this.ready) {
      throw new Error("S3 sync bridge not initialized");
    }

    const length = Math.min(buffer.length, DATA_BUFFER_SIZE);

    // Encode file path into data buffer
    const encoder = new TextEncoder();
    const pathBytes = encoder.encode(filePath);

    if (pathBytes.length > DATA_BUFFER_SIZE - length) {
      throw new Error(`File path too long: ${filePath}`);
    }

    // Write path to data buffer
    this.dataView.set(pathBytes, 0);

    // Write request parameters to control buffer
    this.controlView[1] = position | 0; // lower 32 bits
    this.controlView[2] = (position / 0x100000000) | 0; // upper 32 bits
    this.controlView[3] = length;
    this.controlView[5] = pathBytes.length;

    // Signal request and wake helper worker
    Atomics.store(this.controlView, 0, STATUS_REQUEST);
    Atomics.notify(this.controlView, 0);

    // Block until helper responds (status changes from REQUEST)
    Atomics.wait(this.controlView, 0, STATUS_REQUEST);

    const status = Atomics.load(this.controlView, 0);

    if (status === STATUS_RESPONSE_ERROR) {
      const errorLen = this.controlView[4];
      const errorBytes = this.dataView.slice(0, errorLen);
      const errorMsg = new TextDecoder().decode(errorBytes);

      // Reset to idle and notify helper
      Atomics.store(this.controlView, 0, STATUS_IDLE);
      Atomics.notify(this.controlView, 0);

      throw new Error(`S3 byte-range read failed: ${errorMsg}`);
    }

    // Read response — clamp to buffer size as a safety net
    const bytesRead = Math.min(this.controlView[4], buffer.length);
    buffer.set(this.dataView.subarray(0, bytesRead));

    // Reset to idle and notify helper
    Atomics.store(this.controlView, 0, STATUS_IDLE);
    Atomics.notify(this.controlView, 0);

    return bytesRead;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    console.log(LOG_PREFIX, "Disposed");
  }
}
