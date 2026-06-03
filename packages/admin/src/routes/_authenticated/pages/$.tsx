import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { findPluginPageByPath } from "@/lib/manifest.js";
import { PluginErrorBoundary } from "@/lib/plugin-error-boundary.js";
import { getPluginPage } from "@/lib/plugin-registry.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

const M = {
  loadingAria: defineMessage({
    id: "pluginPage.loading.aria",
    message: "Loading {label}",
    comment: "label: the plugin page's registered label (e.g. 'Audit Log')",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/pages/$")({
  beforeLoad: ({ context, params }) => {
    const splat = params._splat;
    if (!splat) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    const item = findPluginPageByPath(`/pages/${splat}`);
    if (!item) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    if (
      item.capability &&
      !hasCap(context.user.capabilities, item.capability)
    ) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw redirect({ to: "/" });
    }
    return { navItem: item };
  },
  component: PluginPageRoute,
});

function PluginPageRoute(): ReactNode {
  const { navItem } = Route.useRouteContext();
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const labelText = renderLabel(navItem.label);
  // navItem.to is `/pages/<plugin-path>` — derive the plugin's own
  // path for registry lookup.
  const pluginPath = navItem.to.replace(/^\/pages/, "");
  const Component = getPluginPage(pluginPath);
  if (!Component) {
    return <PluginNotLoaded path={pluginPath} />;
  }
  return (
    <PluginErrorBoundary kind="page" pluginLabel={labelText}>
      <Suspense
        fallback={
          <FormEditSkeleton
            ariaLabel={i18n._(
              M.loadingAria.id,
              { label: labelText },
              { message: M.loadingAria.message },
            )}
            testId={`plugin-page__loading__${pluginPath}`}
          />
        }
      >
        {/* eslint-disable-next-line react-hooks/static-components -- registry lookup is a stable Map.get */}
        <Component />
      </Suspense>
    </PluginErrorBoundary>
  );
}

function PluginNotLoaded({ path }: { path: string }): ReactNode {
  return (
    <div
      className="mx-auto max-w-2xl py-12"
      data-testid={`plugin-page__not-loaded__${path}`}
    >
      <h1 className="text-2xl font-semibold">
        <Trans id="pluginPage.notLoaded.title" message="Plugin not loaded" />
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        <Trans
          id="pluginPage.notLoaded.body"
          message="The admin manifest declares a page at <code>{path}</code> but no React component has been registered for it."
          values={{ path }}
          components={{ code: <code className="font-mono" /> }}
          comment="path: the manifest-declared admin-route path (e.g. '/audit-log'); pass through verbatim"
        />
      </p>
    </div>
  );
}
