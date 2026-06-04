import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import { visibleEntryTypes } from "@/lib/manifest.js";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Puzzle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardIndex,
});

function DashboardIndex(): ReactNode {
  const { user } = Route.useRouteContext();
  const greeting = user.name ?? user.email;
  const tiles = visibleEntryTypes(user.capabilities);
  const renderLabel = useLabel();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          data-testid="dashboard-welcome-heading"
          className="text-2xl font-semibold"
        >
          <Trans
            id="dashboard.welcome"
            message="Welcome, {greeting}"
            values={{ greeting: <bdi>{greeting}</bdi> }}
            comment="greeting: the user's display name or email"
          />
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans
            id="dashboard.tagline"
            message="What would you like to work on today?"
          />
        </p>
      </div>

      {tiles.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiles.map((pt) => {
            const label = renderLabel(pt.labels?.plural ?? pt.label);
            // Tile description + browse-button copy stay noun-less so
            // the lowercase-the-plural substitution can't reach DE/RU/
            // PL/UK/AR users. The tile title already carries the type's
            // plural label up top.
            return (
              <Card key={pt.name} data-testid={`dashboard-tile-${pt.name}`}>
                <CardHeader>
                  <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-md">
                    <FileText className="size-5" aria-hidden />
                  </div>
                  <CardTitle>{label}</CardTitle>
                  <CardDescription>
                    {pt.description ?? (
                      <Trans
                        id="dashboard.tile.description.generic"
                        message="Write, edit, and publish."
                      />
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link
                      to="/entries/$slug"
                      params={{ slug: pt.adminSlug }}
                      search={ENTRIES_LIST_DEFAULT_SEARCH}
                      data-testid={`dashboard-tile-${pt.name}-link`}
                    >
                      <Trans
                        id="dashboard.tile.browse.generic"
                        message="Browse"
                      />
                      <ArrowRight className="rtl:rotate-180" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="max-w-xl" data-testid="dashboard-empty-state">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle />
              </EmptyMedia>
              <EmptyTitle>
                <Trans
                  id="dashboard.empty.title"
                  message="No content types yet"
                />
              </EmptyTitle>
              <EmptyDescription>
                <Trans
                  id="dashboard.empty.description"
                  message="Add a plugin that registers a post type (e.g. <0>@plumix/plugin-blog</0>) to see it here."
                  components={{ 0: <code /> }}
                />
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
    </div>
  );
}
