import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { metaBoxFieldColSpanClass } from "@/components/meta-box/meta-box-grid.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
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
  EmptyTitle,
} from "@/components/ui/empty.js";
import { Form } from "@/components/ui/form.js";
import { hasCap } from "@/lib/caps.js";
import {
  findSettingsPageByName,
  groupsForSettingsPage,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

import type {
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
} from "@plumix/core/manifest";
import { seedFromMetaBoxes } from "@plumix/core/manifest";

// Descriptors that need runtime indirection — used outside JSX (aria
// string, state setters). Pure-JSX strings stay inline at their `<Trans>`
// callsite per the rest of admin's style.
const M = {
  loadingAria: defineMessage({
    id: "settings.page.loading",
    message: "Loading settings",
  }),
  loadFailed: defineMessage({
    id: "settings.page.loadFailed",
    message: "Couldn't load these settings. Try again.",
  }),
  saved: defineMessage({
    id: "settings.page.saved",
    message: "Saved.",
  }),
  saveFailed: defineMessage({
    id: "settings.page.saveFailed",
    message: "Couldn't save settings.",
  }),
} satisfies Record<string, MessageDescriptor>;

// Literal API signature rendered inside the empty-state `<code>`.
// Pulled to a module-scope const so the strict rule sees one string
// expression instead of three JSX text fragments split by `{"{"}` /
// `{"}"}` escapes.
// eslint-disable-next-line lingui/no-unlocalized-strings -- API signature, not user copy
const API_SIGNATURE = "ctx.registerSettingsPage(name, { groups: [...] })";

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
  pendingComponent: SettingsPageLoading,
  errorComponent: SettingsPageLoadError,
  component: SettingsPageRoute,
});

function SettingsPageLoading(): ReactNode {
  const { i18n } = useLingui();
  return (
    <FormEditSkeleton
      ariaLabel={i18n._(M.loadingAria.id, undefined, {
        message: M.loadingAria.message,
      })}
      testId="settings-page-loading"
    />
  );
}

function SettingsPageLoadError(): ReactNode {
  return <NotFoundPlaceholder message={M.loadFailed} />;
}

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
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const queryClient = useQueryClient();
  // String branch is plugin-author text rendered verbatim.
  const [serverError, setServerError] = useState<
    MessageDescriptor | string | null
  >(null);
  const [saveNotice, setSaveNotice] = useState<MessageDescriptor | null>(null);

  const { data: stored } = useSuspenseQuery(
    orpc.settings.get.queryOptions({ input: { group: group.name } }),
  );

  // Initial form state: stored value when present, field default when
  // not. Values are `unknown` both ways — `MetaBoxField` renders the
  // right input for each field's `inputType` and hands back the coerced
  // value through rhf's Controller.
  const form = useForm({
    defaultValues: seedFromMetaBoxes([group], stored),
  });

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      orpc.settings.upsert.call({ group: group.name, values: next }),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: async (fresh) => {
      // Re-seed from the server's post-sanitize bag so the form reflects
      // any trimming / coercion the server applied.
      form.reset(seedFromMetaBoxes([group], fresh));
      await queryClient.invalidateQueries({
        queryKey: orpc.settings.get.queryOptions({
          input: { group: group.name },
        }).queryKey,
      });
      setSaveNotice(M.saved);
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : M.saveFailed);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(values);
  });

  return (
    // Container-query root so the inner grid's col-span classes resolve
    // against the card's own width — consistent layout regardless of
    // whether the page route is full-width or narrow.
    <Card
      className="@container"
      data-testid={`settings-group-card-${group.name}`}
    >
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>
              <h2
                className="text-lg font-semibold"
                data-testid={`settings-group-heading-${group.name}`}
              >
                {renderLabel(group.label)}
              </h2>
            </CardTitle>
            {group.description ? (
              <CardDescription>{group.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-12 gap-4">
              {group.fields.map((field) => (
                <MetaBoxField
                  key={field.key}
                  field={field}
                  name={field.key}
                  disabled={save.isPending}
                  className={metaBoxFieldColSpanClass(field.span)}
                />
              ))}
            </div>

            {serverError ? (
              <Alert
                variant="destructive"
                role="alert"
                data-testid={`settings-server-error-${group.name}`}
              >
                <AlertDescription>
                  {typeof serverError === "string"
                    ? serverError
                    : i18n._(serverError.id, undefined, {
                        message: serverError.message,
                      })}
                </AlertDescription>
              </Alert>
            ) : null}

            {saveNotice ? (
              <Alert
                role="status"
                aria-live="polite"
                data-testid={`settings-save-notice-${group.name}`}
              >
                <AlertDescription>
                  {i18n._(saveNotice.id, undefined, {
                    message: saveNotice.message,
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <div className="flex justify-end px-6 pb-6">
            <Button
              type="submit"
              disabled={save.isPending}
              data-testid={`settings-submit-${group.name}`}
            >
              {save.isPending ? (
                <Trans id="settings.page.submit.pending" message="Saving…" />
              ) : (
                <Trans id="settings.page.submit.idle" message="Save changes" />
              )}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}

function EmptyPagePlaceholder(): ReactNode {
  return (
    <Card>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <Trans
              id="settings.page.empty.title"
              message="No groups on this page"
            />
          </EmptyTitle>
          <EmptyDescription>
            {/* The literal-brace code example sits outside `<Trans>` —
                braces inside the message string are ICU-parsed by Lingui's
                MessageFormat compiler at extract / compile time even when
                they appear inside a `<0>` placeholder, and the single-
                quote `'{' '}'` escape doesn't survive `lingui extract`'s
                normalization. Keeping the example as raw JSX side-steps
                the whole pipeline. */}
            <Trans
              id="settings.page.empty.description"
              message="This settings page doesn't reference any registered groups yet. Plugins compose pages with the registerSettingsPage helper:"
            />{" "}
            <code className="font-mono text-xs">{API_SIGNATURE}</code>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  );
}

function NotFoundPlaceholder({
  message,
}: {
  readonly message: MessageDescriptor;
}): ReactNode {
  const { i18n } = useLingui();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        <Trans id="settings.page.notFound.title" message="Not found" />
      </h1>
      <p className="text-muted-foreground text-sm">
        {i18n._(message.id, undefined, { message: message.message })}
      </p>
    </div>
  );
}
