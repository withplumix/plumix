import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { orpc } from "@/orpc/index.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute(): React.ReactNode {
  // Disabled query — proves the end-to-end type chain (server AppRouter →
  // AppRouterClient → orpc.queryOptions → useQuery) compiles. No backend is
  // connected to this scaffold yet, so we skip the actual fetch. Remove
  // `enabled: false` once a route needs real data.
  useQuery({
    ...orpc.post.list.queryOptions({ input: {} }),
    enabled: false,
  });

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Plumix Admin</CardTitle>
          <CardDescription>Shell scaffold — no features yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            React, TanStack Router + Query, and oRPC are wired. Feature routes
            land in later PRs.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
