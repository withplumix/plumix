import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useMemo } from "react";
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
import { toDate } from "@/lib/dates.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import { visibleDashboardWidgets, visibleEntryTypes } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Puzzle } from "lucide-react";

import { DashboardWidgets } from "./-dashboard-widgets.js";

const M = {
  countPublished: defineMessage({
    id: "dashboard.count.published",
    message: "{count, plural, one {# published} other {# published}}",
  }),
  countDraft: defineMessage({
    id: "dashboard.count.draft",
    message: "{count, plural, one {# draft} other {# drafts}}",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardIndex,
});

function DashboardIndex(): ReactNode {
  const { user } = Route.useRouteContext();
  const greeting = user.name ?? user.email;
  const tiles = visibleEntryTypes(user.capabilities);
  const renderLabel = useLabel();
  const { i18n } = useLingui();
  const { formatRelative } = useFormatters();

  const statsQuery = useQuery(orpc.entry.stats.queryOptions({ input: {} }));
  const recentQuery = useQuery(
    orpc.entry.recentActivity.queryOptions({ input: { limit: 8 } }),
  );

  // type → { status → count } for O(1) tile lookups.
  const countsByType = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of statsQuery.data ?? []) {
      (map[row.type] ??= {})[row.status] = row.count;
    }
    return map;
  }, [statsQuery.data]);

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
            const counts = countsByType[pt.name] ?? {};
            return (
              <Card key={pt.name} data-testid={`dashboard-tile-${pt.name}`}>
                <CardHeader>
                  <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-md">
                    <FileText className="size-5" aria-hidden />
                  </div>
                  <CardTitle>{label}</CardTitle>
                  <CardDescription
                    data-testid={`dashboard-tile-${pt.name}-counts`}
                  >
                    {i18n._(
                      M.countPublished.id,
                      { count: counts.published ?? 0 },
                      { message: M.countPublished.message },
                    )}
                    {" · "}
                    {i18n._(
                      M.countDraft.id,
                      { count: counts.draft ?? 0 },
                      { message: M.countDraft.message },
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

      {tiles.length > 0 ? (
        <Card data-testid="dashboard-recent-activity">
          <CardHeader>
            <CardTitle>
              <Trans id="dashboard.recent.title" message="Recent activity" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(recentQuery.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans id="dashboard.recent.empty" message="Nothing yet." />
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {(recentQuery.data ?? []).map((row) => {
                  const tile = tiles.find((t) => t.name === row.type);
                  const inner = (
                    <>
                      <span className="truncate">{row.title}</span>
                      <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                        {formatRelative(toDate(row.updatedAt))}
                      </span>
                    </>
                  );
                  return (
                    <li key={row.id} data-testid={`dashboard-recent-${row.id}`}>
                      {tile ? (
                        <Link
                          to="/entries/$slug/$id/edit"
                          params={{ slug: tile.adminSlug, id: row.id }}
                          className="hover:text-primary flex items-center gap-2 py-2 text-sm"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 py-2 text-sm">
                          {inner}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <DashboardWidgets widgets={visibleDashboardWidgets(user.capabilities)} />
    </div>
  );
}
