import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { hasCap } from "@/lib/caps.js";
import { allSettingsFields, visibleSettingsGroups } from "@/lib/manifest.js";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

function groupSummary(fieldsetCount: number, fieldCount: number): string {
  const fs = `${fieldsetCount} ${fieldsetCount === 1 ? "fieldset" : "fieldsets"}`;
  const fl = `${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`;
  return `${fs} · ${fl}`;
}

export const Route = createFileRoute("/_authenticated/settings/")({
  // The settings surface is admin-only at the floor — `option:manage` is
  // the server's gate for every `option.*` RPC. Plugins may declare a
  // tighter per-group capability; those are filtered by
  // `visibleSettingsGroups` further down rather than rejected here.
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "option:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: SettingsIndexRoute,
});

function SettingsIndexRoute(): ReactNode {
  const { user } = Route.useRouteContext();
  const groups = visibleSettingsGroups(user.capabilities);

  if (groups.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold" data-testid="settings-heading">
          Settings
        </h1>
        <Card data-testid="settings-empty-state">
          <CardHeader>
            <CardTitle>No settings registered yet</CardTitle>
            <CardDescription>
              Core ships no settings by design — plugins (or your own
              plumix.config) declare groups via{" "}
              <code className="font-mono text-xs">
                ctx.registerSettingsGroup(name, {"{"} fieldsets: [...] {"}"})
              </code>
              . Registered groups appear here with one card per group.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold" data-testid="settings-heading">
        Settings
      </h1>
      <div className="grid gap-3" data-testid="settings-group-list">
        {groups.map((group) => (
          <Link
            key={group.name}
            to="/settings/$group"
            params={{ group: group.name }}
            className="block"
            data-testid={`settings-group-link-${group.name}`}
          >
            <Card className="hover:border-primary transition-colors">
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base font-semibold">{group.label}</h2>
                </CardTitle>
                {group.description ? (
                  <CardDescription>{group.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">
                  {groupSummary(
                    group.fieldsets.length,
                    allSettingsFields(group).length,
                  )}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
