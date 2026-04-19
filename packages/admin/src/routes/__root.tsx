import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { sessionQueryOptions } from "@/lib/session.js";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

interface RouterAppContext {
  readonly queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  // Kick off the session probe as early as possible so child routes' beforeLoad
  // can synchronously read it via queryClient.getQueryData. ensureQueryData
  // deduplicates: a single fetch per hard page load.
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  component: RootLayout,
});

function RootLayout(): ReactNode {
  return <Outlet />;
}
