import type { ReactNode } from "react";
import { Suspense } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { findPluginPageByPath } from "@/lib/manifest.js";
import { PluginErrorBoundary } from "@/lib/plugin-error-boundary.js";
import { getPluginPage } from "@/lib/plugin-registry.js";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

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
  // navItem.to is `/pages/<plugin-path>` — derive the plugin's own
  // path for registry lookup.
  const pluginPath = navItem.to.replace(/^\/pages/, "");
  const Component = getPluginPage(pluginPath);
  if (!Component) {
    return <PluginNotLoaded path={pluginPath} />;
  }
  return (
    <PluginErrorBoundary kind="page" pluginLabel={navItem.label}>
      <Suspense
        fallback={
          <FormEditSkeleton
            ariaLabel={`Loading ${navItem.label}`}
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
      <h1 className="text-2xl font-semibold">Plugin not loaded</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The admin manifest declares a page at{" "}
        <code className="font-mono">{path}</code> but no React component has
        been registered for it.
      </p>
    </div>
  );
}
