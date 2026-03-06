import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { PendingMove, PendingDelete } from "../lib/types";

interface FileSidebarDialogsProps {
  // Overwrite dialog
  pendingMove: PendingMove | null;
  onConfirmMove: () => void;
  onCancelMove: () => void;
  // Create directory dialog
  createDirParent: string | null;
  createDirName: string;
  createDirInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateDirNameChange: (name: string) => void;
  onConfirmCreateDir: () => void;
  onCancelCreateDir: () => void;
  // Delete dialog
  pendingDelete: PendingDelete | null;
  onConfirmDelete: () => void;
  onConfirmBulkDelete: () => void;
  onCancelDelete: () => void;
}

export function FileSidebarDialogs({
  pendingMove,
  onConfirmMove,
  onCancelMove,
  createDirParent,
  createDirName,
  createDirInputRef,
  onCreateDirNameChange,
  onConfirmCreateDir,
  onCancelCreateDir,
  pendingDelete,
  onConfirmDelete,
  onConfirmBulkDelete,
  onCancelDelete,
}: FileSidebarDialogsProps) {
  return (
    <>
      {/* Confirmation dialog for file overwrite */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && onCancelMove()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing file?</AlertDialogTitle>
            <AlertDialogDescription>
              A file named <span className="font-medium text-neutral-700 dark:text-neutral-300">&quot;{pendingMove?.existingFileName}&quot;</span> already exists in this location. Do you want to replace it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmMove}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create directory dialog */}
      <AlertDialog open={createDirParent !== null} onOpenChange={(open) => { if (!open) onCancelCreateDir(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New folder</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for the new folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            ref={createDirInputRef}
            value={createDirName}
            onChange={(e) => onCreateDirNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConfirmCreateDir(); } }}
            placeholder="Folder name"
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmCreateDir} disabled={!createDirName.trim()}>
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) onCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.count ? pendingDelete.name : (pendingDelete?.isDirectory ? "folder" : "file")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.count
                ? `Are you sure you want to delete ${pendingDelete.name}? This action cannot be undone.`
                : <>Are you sure you want to delete <span className="font-medium text-neutral-700 dark:text-neutral-300">&quot;{pendingDelete?.name}&quot;</span>? This action cannot be undone.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={pendingDelete?.count ? onConfirmBulkDelete : onConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
