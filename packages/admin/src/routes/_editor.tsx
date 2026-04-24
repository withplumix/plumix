import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { requireAuthenticatedSession } from "@/lib/session.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Full-screen editor layout. Sibling to `_authenticated` — they share
 * the same auth gate but this one drops the admin shell (no left nav,
 * no `ShellHeader`). The editor itself supplies its top bar via the
 * nested route so the entire viewport is available for the canvas +
 * right rail.
 */
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
