import type { ReactNode } from "react";
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
import { hasCap } from "@/lib/caps.js";
import { visibleSettingsPages } from "@/lib/manifest.js";
import { Trans } from "@lingui/react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/")({
  // The settings surface is admin-only at the floor — `settings:manage`
  // is the server's gate for every `settings.*` RPC. Plugins may declare
  // a tighter per-page capability in future; those would be filtered by
  // `visibleSettingsPages` rather than rejected here.
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "settings:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: SettingsIndexRoute,
});

function SettingsIndexRoute(): ReactNode {
  const { user } = Route.useRouteContext();
  const pages = visibleSettingsPages(user.capabilities);

  const heading = (
    <h1 className="text-2xl font-semibold" data-testid="settings-heading">
      <Trans id="settings.title" message="Settings" />
    </h1>
  );

  if (pages.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {heading}
        <Card data-testid="settings-empty-state">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SettingsIcon />
              </EmptyMedia>
              <EmptyTitle>
                <Trans
                  id="settings.empty.title"
                  message="No settings registered yet"
                />
              </EmptyTitle>
              <EmptyDescription>
                <Trans
                  id="settings.empty.description"
                  message="Core ships no settings by design — plugins (or your own plumix.config) declare pages + groups via <0>ctx.registerSettingsPage</0> and <1>ctx.registerSettingsGroup</1>. Registered pages appear here with one card per page."
                  components={{
                    0: <code className="font-mono text-xs" />,
                    1: <code className="font-mono text-xs" />,
                  }}
                />
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {heading}
      <div className="grid gap-3" data-testid="settings-page-list">
        {pages.map((page) => (
          <Link
            key={page.name}
            to="/settings/$page"
            params={{ page: page.name }}
            className="block"
            data-testid={`settings-page-link-${page.name}`}
          >
            <Card className="hover:border-primary transition-colors">
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base font-semibold">{page.label}</h2>
                </CardTitle>
                {page.description ? (
                  <CardDescription>{page.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">
                  <Trans
                    id="settings.pageSummary"
                    message="{count, plural, one {# group} other {# groups}}"
                    values={{ count: page.groups.length }}
                  />
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
