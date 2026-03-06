import type { ComponentType } from "react";
import type { FileViewerProps } from "../viewers/types";
import {
  Csv,
  Document,
  DocumentBlank,
  DeliveryParcel,
  Json,
  LogoJupyter,
  Txt,
  Xls,
  Sql,
  DataTable,
} from "@carbon/icons-react";
import { getFileExtension } from "./paths";
import {
  serializeNotebook,
  type NotebookDocument,
} from "../runtime/core/nbformat";

import { CsvFileViewer } from "../viewers/csv-file-viewer";
import { ExcelFileViewer } from "../viewers/excel-file-viewer";
import { IpynbFileViewer } from "../viewers/ipynb-file-viewer";
import { JsonFileViewer } from "../viewers/json-file-viewer";
import { ParquetFileViewer } from "../viewers/parquet-file-viewer";
import { SqlFileViewer } from "../viewers/sql-file-viewer";
import { TextFileViewer } from "../viewers/text-file-viewer";

export interface ExportFormatDefinition {
  readonly format: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number }>;
}

export interface FileTypeDefinition {
  readonly extension: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; color?: string }>;
  readonly iconColor: string;
  readonly sortPriority: number;
  readonly showSize: boolean;
  readonly viewer: ComponentType<FileViewerProps>;
  readonly canRenderWithoutRuntime: boolean;
  readonly exportFormats: ReadonlyArray<ExportFormatDefinition>;
  readonly defaultBaseName: string | null;
  createNewFileContent(fileName: string): Blob;
}

interface FileTypeInit {
  extension: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  iconColor: string;
  viewer: ComponentType<FileViewerProps>;
  sortPriority?: number;
  showSize?: boolean;
  canRenderWithoutRuntime?: boolean;
  exportFormats?: ReadonlyArray<ExportFormatDefinition>;
  defaultBaseName?: string | null;
}

class FileType implements FileTypeDefinition {
  readonly extension: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; color?: string }>;
  readonly iconColor: string;
  readonly viewer: ComponentType<FileViewerProps>;
  readonly sortPriority: number;
  readonly showSize: boolean;
  readonly canRenderWithoutRuntime: boolean;
  readonly exportFormats: ReadonlyArray<ExportFormatDefinition>;
  readonly defaultBaseName: string | null;

  constructor(init: FileTypeInit) {
    this.extension = init.extension;
    this.label = init.label;
    this.icon = init.icon;
    this.iconColor = init.iconColor;
    this.viewer = init.viewer;
    this.sortPriority = init.sortPriority ?? 10;
    this.showSize = init.showSize ?? true;
    this.canRenderWithoutRuntime = init.canRenderWithoutRuntime ?? false;
    this.exportFormats = init.exportFormats ?? [];
    this.defaultBaseName = init.defaultBaseName ?? null;
  }

  createNewFileContent(_fileName: string): Blob {
    return new Blob([""], { type: "text/plain" });
  }
}

class NotebookFileType extends FileType {
  constructor() {
    super({
      extension: "ipynb",
      label: "Notebook",
      icon: LogoJupyter,
      iconColor: "var(--color-orange-400)",
      sortPriority: 0,
      showSize: false,
      viewer: IpynbFileViewer,
      canRenderWithoutRuntime: true,
      defaultBaseName: "Untitled",
    });
  }

  override createNewFileContent(fileName: string): Blob {
    const displayName = fileName.replace(/\.ipynb$/, "");
    const now = Date.now();
    const doc: NotebookDocument = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { name: "dataspren", display_name: "DataSpren" },
        language_info: { name: "python" },
        dataspren: { name: displayName, created_at: now, updated_at: now },
      },
      cells: [],
    };
    return new Blob([serializeNotebook(doc)], { type: "application/json" });
  }
}

export const FILE_TYPES: Record<string, FileTypeDefinition> = {
  ipynb: new NotebookFileType(),
  csv: new FileType({
    extension: "csv",
    label: "CSV",
    icon: Csv,
    iconColor: "var(--color-green-400)",
    viewer: CsvFileViewer,
    canRenderWithoutRuntime: true,
    exportFormats: [
      { format: "json", label: "JSON", icon: Json },
      { format: "parquet", label: "Parquet", icon: DataTable },
      { format: "xlsx", label: "Excel", icon: Xls },
    ],
  }),
  parquet: new FileType({
    extension: "parquet",
    label: "Parquet",
    icon: DeliveryParcel,
    iconColor: "var(--color-amber-700)",
    viewer: ParquetFileViewer,
    exportFormats: [
      { format: "csv", label: "CSV", icon: Csv },
      { format: "json", label: "JSON", icon: Json },
      { format: "xlsx", label: "Excel", icon: Xls },
    ],
  }),
  xlsx: new FileType({
    extension: "xlsx",
    label: "Excel",
    icon: Xls,
    iconColor: "var(--color-emerald-500)",
    viewer: ExcelFileViewer,
    exportFormats: [
      { format: "csv", label: "CSV", icon: Csv },
      { format: "json", label: "JSON", icon: Json },
      { format: "parquet", label: "Parquet", icon: DataTable },
    ],
  }),
  xls: new FileType({
    extension: "xls",
    label: "Excel",
    icon: Xls,
    iconColor: "var(--color-emerald-500)",
    viewer: ExcelFileViewer,
    exportFormats: [
      { format: "csv", label: "CSV", icon: Csv },
      { format: "json", label: "JSON", icon: Json },
      { format: "parquet", label: "Parquet", icon: DataTable },
    ],
  }),
  json: new FileType({
    extension: "json",
    label: "JSON",
    icon: Json,
    iconColor: "var(--color-yellow-400)",
    viewer: JsonFileViewer,
    canRenderWithoutRuntime: true,
  }),
  txt: new FileType({
    extension: "txt",
    label: "Text file (.txt)",
    icon: Txt,
    iconColor: "var(--color-zinc-400)",
    viewer: TextFileViewer,
    canRenderWithoutRuntime: true,
    defaultBaseName: "untitled",
  }),
  md: new FileType({
    extension: "md",
    label: "Markdown (.md)",
    icon: Document,
    iconColor: "var(--color-blue-400)",
    viewer: TextFileViewer,
    canRenderWithoutRuntime: true,
    defaultBaseName: "untitled",
  }),
  sql: new FileType({
    extension: "sql",
    label: "SQL file (.sql)",
    icon: Sql,
    iconColor: "var(--color-sky-400)",
    viewer: SqlFileViewer,
    canRenderWithoutRuntime: true,
    defaultBaseName: "untitled",
  }),
};

export const UNKNOWN_FILE_TYPE: FileTypeDefinition = new FileType({
  extension: "",
  label: "File",
  icon: DocumentBlank,
  iconColor: "",
  viewer: TextFileViewer,
  canRenderWithoutRuntime: true,
});

export function getFileType(nameOrPath: string): FileTypeDefinition {
  const ext = getFileExtension(nameOrPath);
  if (ext && ext in FILE_TYPES) return FILE_TYPES[ext];
  return UNKNOWN_FILE_TYPE;
}

export const CREATABLE_FILE_TYPES: ReadonlyArray<FileTypeDefinition> = [
  FILE_TYPES.ipynb,
  FILE_TYPES.md,
  FILE_TYPES.txt,
  FILE_TYPES.sql,
];
