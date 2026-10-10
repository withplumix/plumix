import type { ReactNode } from "react";
import { loadSession } from "@/lib/session.js";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/** Bootstrap-state guards stay on the leaf routes. */
export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context.queryClient);
    if (session.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
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
