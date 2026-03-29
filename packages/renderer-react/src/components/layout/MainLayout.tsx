/**
 * Main Layout Component
 * TitleBar at top, then sidebar + content below.
 */
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

export function MainLayout() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8%] top-[-18%] h-[30rem] w-[30rem] rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute bottom-[-18%] right-[-6%] h-[24rem] w-[24rem] rounded-full bg-muted blur-3xl" />
      </div>

      <TitleBar />

      <div className="relative flex flex-1 gap-3 overflow-hidden px-3 pb-3">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="h-full overflow-hidden rounded-[32px] border border-border/70 bg-background/60 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
