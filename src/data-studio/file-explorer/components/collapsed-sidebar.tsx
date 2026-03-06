import { cn } from "@/lib/utils";
import { LogoJupyter } from "@carbon/icons-react";
import { ChevronRight, Home } from "lucide-react";

interface CollapsedSidebarProps {
  showHome: boolean;
  activeFilePath: string | null;
  notebooks: Array<{ filePath: string; name: string }>;
  onExpand: () => void;
  onShowHome: () => void;
  onSelectFile: (path: string | null) => void;
}

export function CollapsedSidebar({
  showHome,
  activeFilePath,
  notebooks,
  onExpand,
  onShowHome,
  onSelectFile,
}: CollapsedSidebarProps) {
  return (
    <div className="w-10 border-r border-neutral-200 dark:border-sidebar-border bg-neutral-50/30 dark:bg-sidebar flex flex-col items-center py-2 select-none">
      <button
        onClick={onExpand}
        className="p-1.5 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
        title="Expand sidebar"
      >
        <ChevronRight size={16} />
      </button>
      <div className="mt-4 flex flex-col gap-1">
        <button
          onClick={onShowHome}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showHome
              ? "bg-neutral-100 dark:bg-sidebar-accent text-neutral-950 dark:text-sidebar-foreground"
              : "text-neutral-400 dark:text-muted-foreground hover:text-neutral-950 dark:hover:text-sidebar-foreground hover:bg-neutral-50 dark:hover:bg-sidebar-accent",
          )}
          title="Home"
        >
          <Home size={14} />
        </button>
        {notebooks.slice(0, 5).map((notebook) => (
          <button
            key={notebook.filePath}
            onClick={() => onSelectFile(notebook.filePath)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              !showHome && notebook.filePath === activeFilePath
                ? "bg-neutral-100 dark:bg-sidebar-accent text-neutral-950 dark:text-sidebar-foreground"
                : "text-neutral-400 dark:text-muted-foreground hover:text-neutral-950 dark:hover:text-sidebar-foreground hover:bg-neutral-50 dark:hover:bg-sidebar-accent",
            )}
            title={notebook.name}
          >
            <LogoJupyter size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
