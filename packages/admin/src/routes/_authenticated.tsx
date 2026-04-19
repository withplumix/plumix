import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { signOut } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
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
    return { user: session.user };
  },
  component: AppShell,
});

// Feature routes register against this nav list. Hard-coded for now — when
// plugin admin chunks land (Phase 11 follow-up) this becomes a registry fed
// by the manifest. `exact` controls TanStack Router's active-link matching:
// `/` must opt in or it'd match every route.
interface NavItem {
  readonly to: "/";
  readonly label: string;
  readonly exact: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Dashboard", exact: true },
];

function AppShell(): ReactNode {
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
      <div className="flex min-h-screen">
        <aside
          aria-label="Main navigation"
          className="hidden w-56 shrink-0 border-r p-4 md:block"
        >
          <div className="mb-6 font-semibold">Plumix</div>
          <nav>
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="hover:bg-accent block rounded px-2 py-1.5 text-sm"
                    activeProps={{ className: "bg-accent font-medium" }}
                    activeOptions={{ exact: item.exact }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b">
            <div className="flex h-14 items-center justify-between px-6">
              <span className="font-semibold md:hidden">Plumix</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-muted-foreground text-sm">
                  {displayName}
                </span>
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
          <main className="flex-1 px-6 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
