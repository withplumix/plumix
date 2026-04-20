import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar.js";
import { ShellHeader } from "@/components/shell/shell-header.js";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { sessionQueryOptions } from "@/lib/session.js";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (!session.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow; see https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes
      throw redirect({ to: session.needsBootstrap ? "/bootstrap" : "/login" });
    }
    return { user: session.user };
  },
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
