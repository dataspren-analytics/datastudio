import type { NotebookCell, NotebookDocument } from "./core/nbformat";
import { parseNotebook, serializeNotebook } from "./core/nbformat";
import type { IRuntimeFileSystem } from "./backends/execution/interface";
import type { FileInfo } from "./backends/execution/interface";

import { toRelativePath } from "../lib/paths";

export function getUniqueName(baseName: string, existingNames: string[]): string {
  const otherNames = new Set(existingNames);
  if (!otherNames.has(baseName)) return baseName;

  let counter = 1;
  let candidate = `${baseName} ${counter}`;
  while (otherNames.has(candidate)) {
    counter++;
    candidate = `${baseName} ${counter}`;
  }
  return candidate;
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim() || "Untitled";
}

export async function createNotebookFile(
  execution: IRuntimeFileSystem,
  options?: {
    name?: string;
    cells?: NotebookCell[];
    existingNames?: string[];
  },
): Promise<string> {
  const baseName = options?.name || "Untitled";
  const uniqueName = getUniqueName(baseName, options?.existingNames ?? []);
  const sanitizedName = sanitizeFileName(uniqueName);
  const fileName = `${sanitizedName}.ipynb`;
  const filePath = `/mnt/local/${fileName}`;
  const now = Date.now();

  const doc: NotebookDocument = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: "dataspren", display_name: "DataSpren" },
      language_info: { name: "python" },
      dataspren: { name: uniqueName, created_at: now, updated_at: now },
    },
    cells: options?.cells ?? [],
  };

  await writeNotebook(execution, filePath, doc);
  return filePath;
}

export interface NotebookInfo {
  name: string;
  path: string;
  updatedAt: number;
}

export async function listNotebooks(
  execution: IRuntimeFileSystem,
): Promise<NotebookInfo[]> {
  const files = await execution.listFiles();
  const notebooks: NotebookInfo[] = [];

  for (const file of files) {
    if (!file.isDirectory && file.path.endsWith(".ipynb")) {
      try {
        const relativePath = toRelativePath(file.path);
        const data = await execution.readFile(relativePath);
        const content = new TextDecoder().decode(data);
        const doc = parseNotebook(content);
        const name =
          doc.metadata.dataspren?.name ?? file.name.replace(".ipynb", "");
        const updatedAt = doc.metadata.dataspren?.updated_at ?? Date.now();
        notebooks.push({ name, path: file.path, updatedAt });
      } catch (e) {
        console.warn(
          `[notebook-utils] Failed to parse notebook: ${file.path}`,
          e,
        );
      }
    }
  }

  notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
  return notebooks;
}

export async function readNotebook(
  execution: IRuntimeFileSystem,
  path: string,
): Promise<NotebookDocument> {
  const relativePath = toRelativePath(path);
  const data = await execution.readFile(relativePath);
  const content = new TextDecoder().decode(data);
  return parseNotebook(content);
}

export async function writeNotebook(
  execution: IRuntimeFileSystem,
  path: string,
  document: NotebookDocument,
  options?: { silent?: boolean },
): Promise<void> {
  const content = serializeNotebook(document);
  const data = new TextEncoder().encode(content);
  const relativePath = toRelativePath(path);
  await execution.writeFile(relativePath, data, options);
}

export type { FileInfo };
