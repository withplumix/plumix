import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { signOut } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (!session.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow; see https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes
      throw redirect({ to: session.needsBootstrap ? "/bootstrap" : "/login" });
    }
    // Narrow `user` once so child routes can read it without re-checking.
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout(): ReactNode {
  const { user } = Route.useRouteContext();
  const router = useRouter();

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSettled: async () => {
      // Drop every cached query on sign-out: the next authed session might be
      // a different user, and permission-gated data must not leak across.
      await router.invalidate();
      router.options.context.queryClient.removeQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      await router.navigate({ to: "/login" });
    },
  });

  const displayName = user.name ?? user.email;

  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-semibold">Plumix</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{displayName}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              {signOutMutation.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
