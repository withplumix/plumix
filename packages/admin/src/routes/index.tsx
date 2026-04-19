import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute(): ReactNode {
  // Disabled query — a compile-time type probe from server AppRouter down to
  // useQuery. Flip `enabled: true` when a real route needs post.list.
  useQuery({
    ...orpc.post.list.queryOptions({ input: {} }),
    enabled: false,
  });

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>Plumix Admin</h1>
          </CardTitle>
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
