import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { hasCap } from "@/lib/caps.js";
import {
  findSettingsPageByName,
  groupsForSettingsPage,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import type { SettingsPageManifestEntry } from "@plumix/core/manifest";
import { Card } from "@plumix/admin-ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@plumix/admin-ui/empty";

import { SettingsGroupCard } from "./-settings-group-card.js";

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
        context.queryClient.query({
          ...orpc.settings.get.queryOptions({ input: { group: group.name } }),
          staleTime: "static",
        }),
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
  const renderLabel = useLabel();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="settings-page-heading"
        >
          {renderLabel(page.label)}
        </h1>
        {page.description ? (
          <p className="text-muted-foreground text-sm">
            {renderLabel(page.description)}
          </p>
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
    <ErrorPlaceholder
      title={<Trans id="settings.page.notFound.title" message="Not found" />}
      description={i18n._(message.id, undefined, { message: message.message })}
    />
  );
}
