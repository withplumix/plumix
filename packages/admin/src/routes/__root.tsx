import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { pathToCrumbs } from "@/lib/breadcrumbs.js";
import { sessionQueryOptions } from "@/lib/session.js";
import { Trans, useLingui } from "@lingui/react";
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";

interface RouterAppContext {
  readonly queryClient: QueryClient;
}

const TITLE_BRAND = "Plumix Admin";

export const Route = createRootRouteWithContext<RouterAppContext>()({
  // Kick off the session probe as early as possible so child routes' beforeLoad
  // can synchronously read it via queryClient.getQueryData. ensureQueryData
  // deduplicates: a single fetch per hard page load.
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout(): ReactNode {
  useDocumentTitle();
  return <Outlet />;
}

function useDocumentTitle(): void {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { i18n } = useLingui();
  useEffect(() => {
    const crumbs = pathToCrumbs(pathname);
    const leaf = crumbs[crumbs.length - 1];
    if (!leaf) {
      document.title = TITLE_BRAND;
      return;
    }
    const label =
      typeof leaf.label === "string"
        ? leaf.label
        : i18n._(leaf.label.id, leaf.values, { message: leaf.label.message });
    document.title = `${label} · ${TITLE_BRAND}`;
  }, [pathname, i18n]);
}

function NotFound(): ReactNode {
  return (
    <div
      data-testid="not-found-page"
      className="flex h-screen flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">
        <Trans id="notFound.title" message="Not found" />
      </h1>
      <p className="text-muted-foreground text-sm">
        <Trans
          id="notFound.description"
          message="The page you're looking for doesn't exist or the resource isn't registered. Check the URL and try again."
        />
      </p>
    </div>
  );
}
