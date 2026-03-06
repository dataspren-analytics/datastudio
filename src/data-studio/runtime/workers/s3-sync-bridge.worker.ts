/**
 * S3 Sync Bridge Helper Worker
 *
 * This worker runs alongside the main Pyodide worker. It receives byte-range
 * read requests via SharedArrayBuffer + Atomics and performs signed S3 Range
 * fetches using aws4fetch.
 *
 * Protocol (SharedArrayBuffer):
 *   Control buffer (Int32Array, 8 slots):
 *     [0]: status — 0=idle, 1=request, 2=response_ok, 3=response_error
 *     [1]: request position (lower 32 bits)
 *     [2]: request position (upper 32 bits)
 *     [3]: request length
 *     [4]: response bytes read / error byte length
 *     [5]: path byte length
 *
 *   Data buffer (Uint8Array):
 *     Request phase: [0..pathLen] = UTF-8 encoded S3 key
 *     Response phase: [0..bytesRead] = response data (or error message)
 */

import { AwsClient } from "aws4fetch";

interface InitMessage {
  type: "init";
  s3Config: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    region: string;
    bucket: string;
  };
  controlBuffer: SharedArrayBuffer;
  dataBuffer: SharedArrayBuffer;
}

// Status constants
const STATUS_IDLE = 0;
const STATUS_REQUEST = 1;
const STATUS_RESPONSE_OK = 2;
const STATUS_RESPONSE_ERROR = 3;

let aws: AwsClient;
let baseUrl: string;
let controlView: Int32Array;
let dataView: Uint8Array;

const LOG_PREFIX = "[S3SyncBridgeWorker]";

self.onmessage = (event: MessageEvent<InitMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    aws = new AwsClient({
      accessKeyId: msg.s3Config.accessKeyId,
      secretAccessKey: msg.s3Config.secretAccessKey,
      region: msg.s3Config.region || "us-east-1",
      service: "s3",
    });

    const endpoint = msg.s3Config.endpoint.replace(/\/+$/, "");
    baseUrl = `${endpoint}/${msg.s3Config.bucket}`;

    controlView = new Int32Array(msg.controlBuffer);
    dataView = new Uint8Array(msg.dataBuffer);

    console.log(LOG_PREFIX, "Initialized, starting request loop");
    self.postMessage({ type: "ready" });

    // Start the polling loop
    processRequests();
  }
};

function buildUrl(key: string): string {
  const encodedKey = key
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return encodedKey ? `${baseUrl}/${encodedKey}` : baseUrl;
}

async function processRequests(): Promise<void> {
  while (true) {
    // Wait for a request (blocks while status is idle)
    Atomics.wait(controlView, 0, STATUS_IDLE);

    const status = Atomics.load(controlView, 0);
    if (status !== STATUS_REQUEST) {
      // Spurious wake or transitional state — wait again
      continue;
    }

    // Read request parameters
    const positionLo = controlView[1];
    const positionHi = controlView[2];
    const position = positionLo + positionHi * 0x100000000;
    const length = controlView[3];
    const pathLength = controlView[5];

    // Decode file path from data buffer
    const pathBytes = dataView.slice(0, pathLength);
    const filePath = new TextDecoder().decode(pathBytes);

    try {
      // S3 Range request
      const url = buildUrl(filePath);
      const rangeEnd = position + length - 1;
      const response = await aws.fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${position}-${rangeEnd}`,
        },
      });

      if (response.status === 416) {
        // 416 Range Not Satisfiable — reading at/past EOF, return 0 bytes
        controlView[4] = 0;
        Atomics.store(controlView, 0, STATUS_RESPONSE_OK);
        Atomics.notify(controlView, 0);
        Atomics.wait(controlView, 0, STATUS_RESPONSE_OK);
        continue;
      }

      if (!response.ok && response.status !== 206) {
        throw new Error(`S3 Range GET failed (${response.status})`);
      }

      const responseBuffer = await response.arrayBuffer();
      let responseData: Uint8Array;
      let bytesRead: number;

      if (response.status === 200) {
        // Server returned full content instead of range — extract requested portion
        const start = Math.min(position, responseBuffer.byteLength);
        const end = Math.min(position + length, responseBuffer.byteLength);
        bytesRead = end - start;
        responseData = new Uint8Array(responseBuffer, start, bytesRead);
      } else {
        // 206 Partial Content — clamp to requested length in case server over-delivers
        bytesRead = Math.min(responseBuffer.byteLength, length);
        responseData = new Uint8Array(responseBuffer, 0, bytesRead);
      }

      // Write response data to shared buffer
      dataView.set(responseData, 0);
      controlView[4] = bytesRead;

      // Signal success
      Atomics.store(controlView, 0, STATUS_RESPONSE_OK);
      Atomics.notify(controlView, 0);
    } catch (err) {
      // Write error message to shared buffer
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorBytes = new TextEncoder().encode(errorMsg);
      dataView.set(errorBytes, 0);
      controlView[4] = errorBytes.length;

      // Signal error
      Atomics.store(controlView, 0, STATUS_RESPONSE_ERROR);
      Atomics.notify(controlView, 0);
    }

    // Wait for the main worker to reset status to idle before processing next request
    Atomics.wait(controlView, 0, STATUS_RESPONSE_OK);
    Atomics.wait(controlView, 0, STATUS_RESPONSE_ERROR);
  }
}
