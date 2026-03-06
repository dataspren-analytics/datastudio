import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCAL_MOUNT, MOUNT_ROOT } from "../../lib/paths";
import { FolderAdd } from "@carbon/icons-react";
import { getFileType } from "../../lib/file-types";
import {
  Copy,
  Download,
  Pencil,
  Share,
  Trash2,
} from "lucide-react";
import type { FileTreeNode } from "../lib/types";

interface FileTreeContextMenuContentProps {
  node: FileTreeNode | null;
  onCreateDirectory: (parentPath: string) => void;
  onStartRename: (path: string, currentName: string) => void;
  onDeleteDirectory: (path: string) => void;
  onDuplicateFile: (path: string) => Promise<void>;
  onDownloadFile: (path: string) => Promise<void>;
  onExportFile: (path: string, format: string) => Promise<void>;
  onCopyPath: (path: string) => void;
  onDeleteFile: (path: string) => Promise<boolean>;
  selectedPaths: Set<string>;
  onBulkDelete: (paths: Set<string>) => void;
  onBulkDownload: (paths: Set<string>) => Promise<void>;
}

export function FileTreeContextMenuContent({
  node,
  onCreateDirectory,
  onStartRename,
  onDeleteDirectory,
  onDuplicateFile,
  onDownloadFile,
  onExportFile,
  onCopyPath,
  onDeleteFile,
  selectedPaths,
  onBulkDelete,
  onBulkDownload,
}: FileTreeContextMenuContentProps) {
  if (!node) return null;

  if (selectedPaths.size > 1) {
    const label = `${selectedPaths.size} items`;
    return (
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          onClick={() => onBulkDownload(selectedPaths)}
          className="text-xs"
        >
          <Download size={12} className="mr-2" />
          Download {label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onBulkDelete(selectedPaths)}
          className="text-xs text-red-600 dark:text-red-400"
        >
          <Trash2 size={12} className="mr-2" />
          Delete {label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  if (node.isDirectory) {
    const isRootLocalDir = node.path === LOCAL_MOUNT;
    const canDelete = !isRootLocalDir && node.path !== MOUNT_ROOT;

    return (
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onClick={() => onCreateDirectory(node.path)}
          className="text-xs"
        >
          <span className="mr-2"><FolderAdd size={12} /></span>
          New folder
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuItem
              onClick={() => onStartRename(node.path, node.name)}
              className="text-xs"
            >
              <Pencil size={12} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteDirectory(node.path)}
              className="text-xs text-red-600 dark:text-red-400"
            >
              <Trash2 size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    );
  }

  const fileType = getFileType(node.name);
  const exportFormats = fileType.exportFormats;

  return (
    <DropdownMenuContent align="start" className="w-40">
      <DropdownMenuItem
        onClick={() => onStartRename(node.path, node.name)}
        className="text-xs"
      >
        <Pencil size={12} className="mr-2" />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onDuplicateFile(node.path)}
        className="text-xs"
      >
        <Copy size={12} className="mr-2" />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onDownloadFile(node.path)}
        className="text-xs"
      >
        <Download size={12} className="mr-2" />
        Download
      </DropdownMenuItem>
      {exportFormats.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <Share size={12} className="mr-2" />
            Export as
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
            {exportFormats.map(({ format, label, icon: Icon }) => (
              <DropdownMenuItem
                key={format}
                onClick={() => onExportFile(node.path, format)}
                className="text-xs"
              >
                <span className="mr-2"><Icon size={12} /></span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem
        onClick={() => onCopyPath(node.path)}
        className="text-xs"
      >
        <Copy size={12} className="mr-2" />
        Copy path
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => onDeleteFile(node.path)}
        className="text-xs text-red-600 dark:text-red-400"
      >
        <Trash2 size={12} className="mr-2" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
