import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { visiblePostTypes } from "@/lib/manifest.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";

import { CONTENT_LIST_DEFAULT_SEARCH } from "./content/$slug/-constants.js";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardIndex,
});

function DashboardIndex(): ReactNode {
  const { user } = Route.useRouteContext();
  const greeting = user.name ?? user.email;
  const tiles = visiblePostTypes(user.capabilities);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          data-testid="dashboard-welcome-heading"
          className="text-2xl font-semibold"
        >
          Welcome, {greeting}
        </h1>
        <p className="text-muted-foreground text-sm">
          What would you like to work on today?
        </p>
      </div>

      {tiles.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiles.map((pt) => {
            const label = pt.labels?.plural ?? pt.label;
            const labelLower = label.toLowerCase();
            return (
              <Card key={pt.name} data-testid={`dashboard-tile-${pt.name}`}>
                <CardHeader>
                  <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-md">
                    <FileText className="size-5" aria-hidden />
                  </div>
                  <CardTitle>{label}</CardTitle>
                  <CardDescription>
                    {pt.description ??
                      `Write, edit, and publish ${labelLower}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link
                      to="/content/$slug"
                      params={{ slug: pt.adminSlug }}
                      search={CONTENT_LIST_DEFAULT_SEARCH}
                      data-testid={`dashboard-tile-${pt.name}-link`}
                    >
                      Browse {labelLower}
                      <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card
          className="max-w-xl border-dashed"
          data-testid="dashboard-empty-state"
        >
          <CardHeader>
            <CardTitle>No content types yet</CardTitle>
            <CardDescription>
              Add a plugin that registers a post type (e.g.{" "}
              <code>@plumix/plugin-blog</code>) to see it here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
