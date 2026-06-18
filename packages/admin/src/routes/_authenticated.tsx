import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar.js";
import { CommandPalette } from "@/components/shell/command-palette.js";
import { ShellHeader } from "@/components/shell/shell-header.js";
import { requireAuthenticatedSession } from "@/lib/session.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@plumix/admin-ui/sidebar";
import { TooltipProvider } from "@plumix/admin-ui/tooltip";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => requireAuthenticatedSession(context.queryClient),
  component: AppShell,
});

function AppShell(): ReactNode {
  const { user } = Route.useRouteContext();

  return (
    <TooltipProvider delayDuration={100}>
      <SidebarProvider>
        <CommandPalette capabilities={user.capabilities} />
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
