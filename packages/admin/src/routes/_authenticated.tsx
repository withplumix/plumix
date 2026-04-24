import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar.js";
import { ShellHeader } from "@/components/shell/shell-header.js";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { requireAuthenticatedSession } from "@/lib/session.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => requireAuthenticatedSession(context.queryClient),
  component: AppShell,
});

function AppShell(): ReactNode {
  const { user } = Route.useRouteContext();

  return (
    <TooltipProvider delayDuration={100}>
      <SidebarProvider>
        <AppSidebar user={user} capabilities={user.capabilities} />
        <SidebarInset>
          <ShellHeader />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
