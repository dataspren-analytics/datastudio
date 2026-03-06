import type { FileInfo } from "./backends/execution/interface";
import { LOCAL_MOUNT } from "../lib/paths";

async function listFilesRecursive(
  dir: FileSystemDirectoryHandle,
  pathPrefix: string,
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  for await (const [name, handle] of dir.entries()) {
    const relativePath = pathPrefix ? `${pathPrefix}/${name}` : name;
    const fullPath = `${LOCAL_MOUNT}/${relativePath}`;

    if (handle.kind === "file") {
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({ name, path: fullPath, size: file.size, isDirectory: false });
      } catch {
        // File may be locked by a sync handle in another context, skip it
      }
    } else if (handle.kind === "directory") {
      files.push({ name, path: fullPath, size: 0, isDirectory: true });
      const subFiles = await listFilesRecursive(
        handle as FileSystemDirectoryHandle,
        relativePath,
      );
      files.push(...subFiles);
    }
  }

  return files;
}

export async function listOPFSFiles(): Promise<FileInfo[]> {
  try {
    const root = await navigator.storage.getDirectory();

    const localDir: FileInfo = {
      name: "local",
      path: "/mnt/local",
      size: 0,
      isDirectory: true,
    };
    const files = await listFilesRecursive(root, "");
    return [localDir, ...files];
  } catch {
    return [];
  }
}

export async function readOPFSFile(opfsPath: string): Promise<Uint8Array> {
  const parts = opfsPath.split("/").filter(Boolean);
  const root = await navigator.storage.getDirectory();

  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }

  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function writeOPFSFile(opfsPath: string, data: Uint8Array): Promise<void> {
  const parts = opfsPath.split("/").filter(Boolean);
  const root = await navigator.storage.getDirectory();

  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }

  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  const buffer: ArrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await writable.write(buffer);
  await writable.close();
}
