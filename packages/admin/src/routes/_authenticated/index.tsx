import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardIndex,
});

function DashboardIndex(): ReactNode {
  const { user } = Route.useRouteContext();
  const greeting = user.name ?? user.email;

  return (
    <section aria-labelledby="dashboard-heading" className="space-y-2">
      <h1 id="dashboard-heading" className="text-2xl font-semibold">
        Welcome, {greeting}
      </h1>
      <p className="text-muted-foreground text-sm">
        Posts, users, and settings land in follow-up PRs.
      </p>
    </section>
  );
}
