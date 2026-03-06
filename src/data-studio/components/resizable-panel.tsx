"use client";

import { cn } from "@/lib/utils";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Direction = "horizontal" | "vertical";

interface ResizablePanelProps {
  /** Resize direction: "horizontal" resizes width, "vertical" resizes height */
  direction: Direction;
  /** Current size in pixels */
  size: number;
  /** Called with the new size when the user drags the handle */
  onSizeChange: (size: number) => void;
  /** Minimum size in pixels (default: 100) */
  minSize?: number;
  /** Maximum size in pixels (default: 600) */
  maxSize?: number;
  /** Where the handle sits relative to the panel */
  handlePosition?: "start" | "end";
  /** Additional className for the outer wrapper */
  className?: string;
  /** Additional className for the inner content container */
  contentClassName?: string;
  /** Ref forwarded to the inner content div */
  contentRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}

export function ResizablePanel({
  direction,
  size,
  onSizeChange,
  minSize = 100,
  maxSize = 600,
  handlePosition = "end",
  className,
  contentClassName,
  contentRef,
  children,
}: ResizablePanelProps) {
  const [isResizing, setIsResizing] = useState(false);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);

      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      const startSize = size;

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        const currentPos = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos;
        // For "start" handle position, dragging in the negative direction grows the panel
        const effectiveDelta = handlePosition === "start" ? -delta : delta;
        const newSize = Math.max(minSize, Math.min(startSize + effectiveDelta, maxSize));
        onSizeChange(newSize);
      };

      const onPointerUp = () => {
        setIsResizing(false);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, size, onSizeChange, minSize, maxSize, handlePosition],
  );

  const isHorizontal = direction === "horizontal";
  const sizeStyle = isHorizontal ? { width: size } : { height: size };

  // Handle positioning
  const handleClasses = isHorizontal
    ? cn(
        "absolute top-0 w-1 h-full cursor-col-resize z-20 transition-colors",
        handlePosition === "end" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
      )
    : cn(
        "absolute left-0 right-0 h-1 cursor-row-resize z-20 transition-colors",
        handlePosition === "start" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
      );

  return (
    <div className={cn("relative shrink-0", className)} style={sizeStyle}>
      <div
        onPointerDown={handlePointerDown}
        className={cn(handleClasses, isResizing ? "bg-blue-500/50" : "hover:bg-blue-500/50")}
      />
      <div ref={contentRef} className={cn("h-full w-full overflow-hidden", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
