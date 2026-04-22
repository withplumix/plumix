import type { ReactNode } from "react";
import { useState } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { SettingsField } from "@/components/settings/field.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { hasCap } from "@/lib/caps.js";
import {
  findSettingsPageByName,
  groupsForSettingsPage,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";

import type {
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
} from "@plumix/core/manifest";

export const Route = createFileRoute("/_authenticated/settings/$page")({
  beforeLoad: ({ context, params }): { page: SettingsPageManifestEntry } => {
    const page = findSettingsPageByName(params.page);
    if (!page) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // `settings:manage` matches the RPC gate; keeping the route + server
    // checks in lockstep means no "route opens, RPC 403s" footgun.
    if (!hasCap(context.user.capabilities, "settings:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { page };
  },
  // Preload every group referenced by this page. `settings.get` is
  // per-group, so we fan out one query per group — each card owns its
  // own cache entry and can refetch independently after a save.
  loader: ({ context }) => {
    const groups = groupsForSettingsPage(context.page);
    return Promise.all(
      groups.map((group) =>
        context.queryClient.ensureQueryData(
          orpc.settings.get.queryOptions({ input: { group: group.name } }),
        ),
      ),
    );
  },
  pendingComponent: () => (
    <FormEditSkeleton
      ariaLabel="Loading settings"
      testId="settings-page-loading"
    />
  ),
  errorComponent: () => (
    <NotFoundPlaceholder message="Couldn't load these settings. Try again." />
  ),
  component: SettingsPageRoute,
});

function SettingsPageRoute(): ReactNode {
  const { page } = Route.useRouteContext();
  const groups = groupsForSettingsPage(page);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="settings-page-heading"
        >
          {page.label}
        </h1>
        {page.description ? (
          <p className="text-muted-foreground text-sm">{page.description}</p>
        ) : null}
      </header>

      {groups.length === 0 ? (
        <EmptyPagePlaceholder />
      ) : (
        groups.map((group) => (
          <SettingsGroupCard key={group.name} group={group} />
        ))
      )}
    </div>
  );
}

function SettingsGroupCard({
  group,
}: {
  readonly group: SettingsGroupManifestEntry;
}): ReactNode {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const { data: stored } = useSuspenseQuery(
    orpc.settings.get.queryOptions({ input: { group: group.name } }),
  );

  // Initial form state: stored value when present, field default when
  // not. Values are `unknown` out of `settings.get`; cast to string for
  // the text/textarea inputs the `SettingsField` dispatcher handles
  // today.
  const defaultValues: Record<string, string> = Object.fromEntries(
    group.fields.map((f) => [
      f.name,
      typeof stored[f.name] === "string"
        ? (stored[f.name] as string)
        : (f.default ?? ""),
    ]),
  );

  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      orpc.settings.upsert.call({ group: group.name, values }),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.settings.get.queryOptions({
          input: { group: group.name },
        }).queryKey,
      });
      setSaveNotice("Saved.");
    },
    onError: (err) => {
      setServerError(
        err instanceof Error ? err.message : "Couldn't save settings.",
      );
    },
  });

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      save.mutate(value);
    },
  });

  return (
    <Card data-testid={`settings-group-card-${group.name}`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <CardHeader>
          <CardTitle>
            <h2
              className="text-lg font-semibold"
              data-testid={`settings-group-heading-${group.name}`}
            >
              {group.label}
            </h2>
          </CardTitle>
          {group.description ? (
            <CardDescription>{group.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {group.fields.map((field) => (
            <form.Field key={field.name} name={field.name}>
              {(f) => (
                <SettingsField
                  field={field}
                  value={f.state.value}
                  onChange={f.handleChange}
                  disabled={save.isPending}
                  testId={`settings-field-${group.name}-${field.name}`}
                />
              )}
            </form.Field>
          ))}

          {serverError ? (
            <Alert
              variant="destructive"
              data-testid={`settings-server-error-${group.name}`}
            >
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          {saveNotice ? (
            <Alert data-testid={`settings-save-notice-${group.name}`}>
              <AlertDescription>{saveNotice}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <div className="flex justify-end px-6 pb-6">
          <Button
            type="submit"
            disabled={save.isPending}
            data-testid={`settings-submit-${group.name}`}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EmptyPagePlaceholder(): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No groups on this page</CardTitle>
        <CardDescription>
          This settings page doesn't reference any registered groups yet.
          Plugins compose pages with{" "}
          <code className="font-mono text-xs">
            ctx.registerSettingsPage(name, {"{"} groups: [...] {"}"})
          </code>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function NotFoundPlaceholder({ message }: { message: string }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
