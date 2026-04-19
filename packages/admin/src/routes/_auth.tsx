import type { ReactNode } from "react";
import { sessionQueryOptions } from "@/lib/session.js";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Unauth-only layout: wraps /login and /bootstrap with the full-screen
// centered-card chrome, and runs the single "already authed → go home"
// guard that both routes need. Per-screen bootstrap-state guards (needs to
// be on /bootstrap vs /login) stay on the leaf routes.
export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (session.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
    return { session };
  },
  component: AuthLayout,
});

function AuthLayout(): ReactNode {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </main>
  );
}
