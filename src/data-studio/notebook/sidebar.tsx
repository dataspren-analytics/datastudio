"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Braces,
  ChevronRight,
  Database,
  FunctionSquare,
  Table2,
  Variable,
} from "lucide-react";
import { useCallback, useState } from "react";
import { CellContentPopover } from "../components/cell-content-popover";
import { useRuntime } from "../provider/runtime-provider";

export function Sidebar() {
  const { functions, variables, tables } = useRuntime();
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  const [expandedVariables, setExpandedVariables] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState({
    functions: true,
    variables: true,
    views: true,
  });

  const toggleTableExpanded = useCallback((tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  }, []);

  const toggleFunctionExpanded = useCallback((fnName: string) => {
    setExpandedFunctions((prev) => {
      const next = new Set(prev);
      if (next.has(fnName)) {
        next.delete(fnName);
      } else {
        next.add(fnName);
      }
      return next;
    });
  }, []);

  const toggleVariableExpanded = useCallback((varName: string) => {
    setExpandedVariables((prev) => {
      const next = new Set(prev);
      if (next.has(varName)) {
        next.delete(varName);
      } else {
        next.add(varName);
      }
      return next;
    });
  }, []);

  return (
    <div className="w-full bg-neutral-50/30 dark:bg-sidebar flex flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        {/* Functions section */}
        <Collapsible
          open={openSections.functions}
          onOpenChange={(open) => setOpenSections((s) => ({ ...s, functions: open }))}
          className="border-b border-neutral-200 dark:border-border"
        >
          <CollapsibleTrigger className="w-full px-4 py-3 border-b border-neutral-200/50 dark:border-border/50 hover:bg-neutral-50 dark:hover:bg-accent transition-colors">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-950 dark:text-foreground">
              <ChevronRight
                size={14}
                className={cn(
                  "text-neutral-400 transition-transform",
                  openSections.functions && "rotate-90",
                )}
              />
              <Braces size={14} />
              <span>Functions</span>
              {functions.length > 0 && (
                <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-xs">{functions.length}</span>
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-2">
              {functions.length === 0 ? (
                <div className="px-2 py-4 text-xs text-neutral-400 dark:text-muted-foreground text-center">
                  No functions registered. Use{" "}
                  <code className="bg-neutral-100 dark:bg-muted text-neutral-600 dark:text-muted-foreground px-1 rounded">@sql_func</code> decorator in Python.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {functions.map((fn) => (
                    <div key={fn.name}>
                      <button
                        onClick={() => toggleFunctionExpanded(fn.name)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-950 dark:text-foreground hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors"
                      >
                        <ChevronRight
                          size={12}
                          className={cn(
                            "text-neutral-400 transition-transform",
                            expandedFunctions.has(fn.name) && "rotate-90",
                          )}
                        />
                        <FunctionSquare size={12} className="text-blue-500" />
                        <span className="font-medium truncate">{fn.name}</span>
                        <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-[10px]">
                          {fn.returnType}
                        </span>
                      </button>
                      {expandedFunctions.has(fn.name) && (
                        <div className="ml-5 pl-2 border-l border-neutral-200/50 dark:border-border/50">
                          {fn.parameters.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-neutral-400 dark:text-muted-foreground italic">
                              No parameters
                            </div>
                          ) : (
                            fn.parameters.map((param) => (
                              <div
                                key={param.name}
                                className="flex items-center gap-2 px-2 py-1 text-xs"
                              >
                                <span className="text-neutral-950 dark:text-foreground truncate">
                                  {param.name}
                                </span>
                                <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-[10px] uppercase">
                                  {param.type}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Variables section */}
        <Collapsible
          open={openSections.variables}
          onOpenChange={(open) => setOpenSections((s) => ({ ...s, variables: open }))}
          className="border-b border-neutral-200 dark:border-border"
        >
          <CollapsibleTrigger className="w-full px-4 py-3 border-b border-neutral-200/50 dark:border-border/50 hover:bg-neutral-50 dark:hover:bg-accent transition-colors">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-950 dark:text-foreground">
              <ChevronRight
                size={14}
                className={cn(
                  "text-neutral-400 transition-transform",
                  openSections.variables && "rotate-90",
                )}
              />
              <Variable size={14} />
              <span>Variables</span>
              {variables.length > 0 && (
                <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-xs">{variables.length}</span>
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-2">
              {variables.length === 0 ? (
                <div className="px-2 py-4 text-xs text-neutral-400 dark:text-muted-foreground text-center">
                  No variables defined. Run Python code to create variables.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {variables.map((v) => {
                    const isSimpleType = ["int", "float", "bool", "str"].includes(v.type);
                    return (
                      <div key={v.name}>
                        {isSimpleType ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-950 dark:text-foreground hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors">
                            <div className="w-3 shrink-0" />
                            <Variable size={12} className="text-violet-500 dark:text-violet-400 shrink-0" />
                            <span className="font-medium truncate">{v.name}</span>
                            <CellContentPopover value={v.value}>
                              <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-[10px] truncate max-w-[100px] cursor-default">
                                {v.value}
                              </span>
                            </CellContentPopover>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleVariableExpanded(v.name)}
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-950 dark:text-foreground hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors"
                            >
                              <ChevronRight
                                size={12}
                                className={cn(
                                  "text-neutral-400 dark:text-muted-foreground transition-transform shrink-0",
                                  expandedVariables.has(v.name) && "rotate-90",
                                )}
                              />
                              <Variable size={12} className="text-violet-500 dark:text-violet-400 shrink-0" />
                              <span className="font-medium truncate">{v.name}</span>
                              <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-[10px]">
                                {v.type}
                              </span>
                            </button>
                            {expandedVariables.has(v.name) && (
                              <div className="ml-5 pl-2 border-l border-neutral-200/50 dark:border-border/50">
                                <CellContentPopover value={v.value}>
                                  <div className="px-2 py-1 text-xs cursor-default">
                                    <pre className="text-neutral-400 dark:text-muted-foreground text-[10px] whitespace-pre-wrap break-all">
                                      {v.value}
                                    </pre>
                                    {v.size && (
                                      <span className="text-neutral-400/70 dark:text-muted-foreground/70 text-[10px]">
                                        {v.size}
                                      </span>
                                    )}
                                  </div>
                                </CellContentPopover>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Views section */}
        <Collapsible
          open={openSections.views}
          onOpenChange={(open) => setOpenSections((s) => ({ ...s, views: open }))}
          className="border-b border-neutral-200 dark:border-border"
        >
          <CollapsibleTrigger className="w-full px-4 py-3 border-b border-neutral-200/50 dark:border-border/50 hover:bg-neutral-50 dark:hover:bg-accent transition-colors">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-950 dark:text-foreground">
              <ChevronRight
                size={14}
                className={cn(
                  "text-neutral-400 transition-transform",
                  openSections.views && "rotate-90",
                )}
              />
              <Database size={14} />
              <span>Views</span>
              {tables.length > 0 && (
                <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-xs">{tables.length}</span>
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-2">
              {tables.length === 0 ? (
                <div className="px-2 py-4 text-xs text-neutral-400 dark:text-muted-foreground text-center">
                  No views yet. Run a SQL cell to create one.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {tables.map((table) => (
                    <div key={table.name}>
                      <button
                        onClick={() => toggleTableExpanded(table.name)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-950 dark:text-foreground hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors"
                      >
                        <ChevronRight
                          size={12}
                          className={cn(
                            "text-neutral-400 dark:text-muted-foreground transition-transform",
                            expandedTables.has(table.name) && "rotate-90",
                          )}
                        />
                        <Table2 size={12} className="text-emerald-500 dark:text-emerald-400" />
                        <span className="font-medium truncate">{table.name}</span>
                        <span className="ml-auto text-neutral-400 dark:text-muted-foreground">
                          {table.columns.length}
                        </span>
                      </button>
                      {expandedTables.has(table.name) && (
                        <div className="ml-5 pl-2 border-l border-neutral-200/50 dark:border-border/50">
                          {table.columns.map((col) => (
                            <div
                              key={col.name}
                              className="flex items-center gap-2 px-2 py-1 text-xs"
                            >
                              <span className="text-neutral-950 dark:text-foreground truncate">{col.name}</span>
                              <span className="ml-auto text-neutral-400 dark:text-muted-foreground text-[10px] uppercase">
                                {col.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
  );
}
