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
import { allSettingsFields, findSettingsGroupByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { SettingsGroupManifestEntry } from "@plumix/core/manifest";

// Storage keys are flat: `${groupName}.${fieldName}`. Fieldsets are a
// UI-only grouping — they don't namespace the key — so field names
// must be unique across the whole group (enforced at registration).
function optionKey(groupName: string, fieldName: string): string {
  return `${groupName}.${fieldName}`;
}

export const Route = createFileRoute("/_authenticated/settings/$group")({
  beforeLoad: ({ context, params }): { group: SettingsGroupManifestEntry } => {
    const group = findSettingsGroupByName(params.group);
    if (!group) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // `option:manage` matches the RPC gate; keeping the route + server
    // checks in lockstep means no "route opens, RPC 403s" footgun.
    if (!hasCap(context.user.capabilities, "option:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { group };
  },
  // Bulk-fetch every field key in one round-trip — `option.getMany` is
  // the shape the settings form wants (one request, missing keys absent
  // from the map and the form falls back to each field's `default`).
  // The group reference comes from `beforeLoad`'s returned context so we
  // avoid a second manifest lookup.
  loader: ({ context, params }) => {
    const names = allSettingsFields(context.group).map((f) =>
      optionKey(params.group, f.name),
    );
    if (names.length === 0) return Promise.resolve({});
    return context.queryClient.ensureQueryData(
      orpc.option.getMany.queryOptions({ input: { names } }),
    );
  },
  pendingComponent: () => (
    <FormEditSkeleton
      ariaLabel="Loading settings"
      testId="settings-group-loading"
    />
  ),
  errorComponent: () => (
    <NotFoundPlaceholder message="Couldn't load these settings. Try again." />
  ),
  component: SettingsGroupRoute,
});

function SettingsGroupRoute(): ReactNode {
  const { group } = Route.useRouteContext();
  const { group: groupName } = Route.useParams();
  const fields = allSettingsFields(group);
  if (fields.length === 0) {
    return <EmptyGroupPlaceholder group={group} />;
  }
  return <SettingsGroupForm group={group} groupName={groupName} />;
}

function SettingsGroupForm({
  group,
  groupName,
}: {
  readonly group: SettingsGroupManifestEntry;
  readonly groupName: string;
}): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const flat = allSettingsFields(group);
  const names = flat.map((f) => optionKey(groupName, f.name));
  const { data: stored } = useSuspenseQuery(
    orpc.option.getMany.queryOptions({ input: { names } }),
  );

  // Initial form state: stored value when present, field default when not.
  const defaultValues: Record<string, string> = Object.fromEntries(
    flat.map((f) => [
      f.name,
      stored[optionKey(groupName, f.name)] ?? f.default ?? "",
    ]),
  );

  const save = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      // Persist one key per field. Concurrent calls are fine — option
      // rows don't inter-reference, and `option.set` is an upsert.
      // `isAutoloaded` flows from each field's manifest declaration
      // (defaults to true server-side when omitted) so settings stay
      // on the autoload fast path unless the plugin author opts out.
      await Promise.all(
        flat.map((field) =>
          orpc.option.set.call({
            name: optionKey(groupName, field.name),
            value: values[field.name] ?? "",
            isAutoloaded: field.autoload,
          }),
        ),
      );
    },
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.option.getMany.queryOptions({ input: { names } })
          .queryKey,
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        to="/settings"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="settings-back-link"
      >
        <ArrowLeft className="size-4" />
        Back to settings
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="settings-group-heading">{group.label}</h1>
          </CardTitle>
          {group.description ? (
            <CardDescription>{group.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            {group.fieldsets.map((fs) => (
              <fieldset
                key={fs.name}
                className="flex flex-col gap-4 border-0 p-0"
                data-testid={`settings-fieldset-${fs.name}`}
              >
                {fs.label ? (
                  <legend
                    className="mb-1 text-sm font-semibold"
                    data-testid={`settings-fieldset-legend-${fs.name}`}
                  >
                    {fs.label}
                  </legend>
                ) : null}
                {fs.description ? (
                  <p className="text-muted-foreground -mt-2 text-xs">
                    {fs.description}
                  </p>
                ) : null}
                {fs.fields.map((field) => (
                  <form.Field key={field.name} name={field.name}>
                    {(f) => (
                      <SettingsField
                        field={field}
                        value={f.state.value}
                        onChange={f.handleChange}
                        disabled={save.isPending}
                        testId={`settings-field-${field.name}`}
                      />
                    )}
                  </form.Field>
                ))}
              </fieldset>
            ))}

            {serverError ? (
              <Alert variant="destructive" data-testid="settings-server-error">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            {saveNotice ? (
              <Alert data-testid="settings-save-notice">
                <AlertDescription>{saveNotice}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigate({ to: "/settings" });
                }}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={save.isPending}
                data-testid="settings-submit"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyGroupPlaceholder({
  group,
}: {
  readonly group: SettingsGroupManifestEntry;
}): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        to="/settings"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to settings
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{group.label}</CardTitle>
          <CardDescription>
            This group has no fieldsets with fields yet. Plugins contribute
            sections via{" "}
            <code className="font-mono text-xs">
              ctx.registerSettingsFieldset(...)
            </code>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
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
