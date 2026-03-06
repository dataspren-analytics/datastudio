"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useState } from "react";
import { cellTypeConfig, type SelectableCellType } from "../constants";

interface AddCellDividerProps {
  onAddCell: (type: SelectableCellType) => void;
}

export function AddCellDivider({ onAddCell }: AddCellDividerProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      className="relative h-0 flex items-center justify-center before:absolute before:inset-x-0 before:-top-4 before:-bottom-4 before:content-['']"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !isMenuOpen && setIsHovered(false)}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 -translate-y-1/2 h-px transition-colors",
          isHovered || isMenuOpen ? "bg-neutral-300 dark:bg-neutral-600" : "bg-transparent",
        )}
      />
      <DropdownMenu
        open={isMenuOpen}
        onOpenChange={(open) => {
          setIsMenuOpen(open);
          if (!open) setIsHovered(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "relative z-10 flex items-center justify-center w-6 h-6 rounded-full border bg-white dark:bg-neutral-800 shadow-sm transition-all",
              isHovered || isMenuOpen
                ? "opacity-100 scale-100 border-neutral-300 dark:border-neutral-600 text-neutral-950 dark:text-neutral-100"
                : "opacity-0 scale-75 border-transparent text-neutral-400",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Plus size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="w-[140px]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {(Object.keys(cellTypeConfig) as SelectableCellType[]).map((type) => {
            const config = cellTypeConfig[type];
            const Icon = config.icon;
            return (
              <DropdownMenuItem
                key={type}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddCell(type);
                }}
                className="font-mono text-xs"
              >
                <Icon size={12} />
                <span>{config.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
