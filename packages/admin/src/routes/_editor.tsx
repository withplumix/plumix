import type { ReactNode } from "react";
import { requireAuthenticatedSession } from "@/lib/session.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { TooltipProvider } from "@plumix/admin-ui/tooltip";

export const Route = createFileRoute("/_editor")({
  beforeLoad: ({ context }) => requireAuthenticatedSession(context.queryClient),
  component: EditorLayout,
});

function EditorLayout(): ReactNode {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-dvh flex-col">
        <Outlet />
      </div>
    </TooltipProvider>
  );
}
