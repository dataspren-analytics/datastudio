"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

interface CellContentPopoverProps {
  value: unknown;
  children: React.ReactNode;
}

export function CellContentPopover({ value, children }: CellContentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const stringValue = value === null ? "null" : String(value);

  useEffect(() => {
    if (!open) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(stringValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="cursor-default"
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] max-h-[300px] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
          <span className="text-xs font-medium text-muted-foreground">Cell Content</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
        <ScrollArea className="max-h-[250px]">
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all select-all">
            {value === null ? (
              <span className="text-muted-foreground italic">null</span>
            ) : (
              stringValue
            )}
          </pre>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
