import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspacePageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function WorkspacePage({
  eyebrow,
  title,
  description,
  actions,
  aside,
  children,
  className,
  contentClassName,
}: WorkspacePageProps) {
  return (
    <div className={cn("workspace-page", className)}>
      <div className="workspace-surface flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              {eyebrow ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70">
                  {eyebrow}
                </div>
              ) : null}
              <div className="space-y-1">
                <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground">
                  {title}
                </h1>
                {description ? (
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-0",
            aside ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1",
          )}
        >
          <div className={cn("min-h-0 overflow-y-auto p-6", contentClassName)}>
            {children}
            {aside ? (
              <div className="pt-4 xl:hidden">
                <div className="space-y-4 rounded-[28px] border border-border/60 bg-background/45 p-4">
                  {aside}
                </div>
              </div>
            ) : null}
          </div>
          {aside ? (
            <aside className="hidden min-h-0 border-l border-border/60 bg-background/45 xl:flex xl:flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">{aside}</div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WorkspacePanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("workspace-panel", className)}>{children}</section>
  );
}

export function WorkspacePanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
